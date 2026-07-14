import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { RowType } from "@docsys/database";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { rankBetween } from "../common/rank";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ExportQueue } from "./export-queue";

export type ExportFormat = "csv" | "docx";

interface ParsedImportRow {
  level: number;
  rowType: RowType;
  title: string;
  description: string;
}

const VALID_ROW_TYPES: RowType[] = ["heading", "requirement", "test_case", "test_step", "note"];

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly queue: ExportQueue,
  ) {}

  async createExport(actorId: string, documentId: string, format: ExportFormat) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "document.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const job = await this.prisma.exportJob.create({
      data: {
        organizationId: document.organizationId,
        documentId: document.id,
        requestedById: actorId,
        jobType: format,
        status: "pending",
        parameters: { format },
      },
    });
    await this.queue.enqueue({ exportJobId: job.id });
    return { id: job.id, status: job.status, progress: job.progress, jobType: job.jobType };
  }

  async getExport(actorId: string, jobId: string) {
    const job = await this.prisma.exportJob.findFirst({ where: { id: jobId } });
    if (!job) throw new NotFoundException("Export job not found");
    await this.access.assertPermission(actorId, "document.read", { organizationId: job.organizationId });
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      jobType: job.jobType,
      errorMessage: job.errorMessage,
      ready: job.status === "completed" && job.resultStorageKey !== null,
    };
  }

  async downloadUrl(actorId: string, jobId: string): Promise<{ url: string }> {
    const job = await this.prisma.exportJob.findFirst({ where: { id: jobId } });
    if (!job) throw new NotFoundException("Export job not found");
    await this.access.assertPermission(actorId, "document.read", { organizationId: job.organizationId });
    if (job.status !== "completed" || !job.resultStorageKey) {
      throw new UnprocessableEntityException("Export is not ready");
    }
    const extension = job.jobType === "docx" ? "docx" : "csv";
    const url = await this.storage.presignedDownloadUrl(job.resultStorageKey, `export-${job.id}.${extension}`);
    return { url };
  }

  async importCsv(actorId: string, documentId: string, csvText: string) {
    const document = await this.requireDocument(documentId);
    await this.access.assertPermission(actorId, "row.write", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    const rows = parseImportCsv(csvText);
    if (rows.length === 0) throw new UnprocessableEntityException("No importable rows found");

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${document.id}::text, 0))`;
      const stack: { id: string; ancestorPath: string; depth: number }[] = [];
      const lastRankByParent = new Map<string | null, string>();
      let count = 0;

      for (const parsed of rows) {
        while (stack.length > parsed.level) stack.pop();
        const parent = stack.length > 0 ? stack[stack.length - 1] : null;
        const parentId = parent ? parent.id : null;
        const ancestorPath = parent ? `${parent.ancestorPath}${parent.id}/` : "";
        const depth = parent ? parent.depth + 1 : 0;
        const prevRank = lastRankByParent.get(parentId) ?? null;
        const rank = rankBetween(prevRank, null);
        lastRankByParent.set(parentId, rank);

        const row = await tx.documentRow.create({
          data: {
            organizationId: document.organizationId,
            documentId: document.id,
            parentId,
            rank,
            ancestorPath,
            depth,
            rowType: parsed.rowType,
            title: parsed.title,
            description: parsed.description || null,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        if (parsed.rowType === "requirement") await tx.requirementDetail.create({ data: { rowId: row.id } });
        else if (parsed.rowType === "test_case") await tx.testCaseDetail.create({ data: { rowId: row.id } });
        else if (parsed.rowType === "test_step") await tx.testStepDetail.create({ data: { rowId: row.id } });

        stack.push({ id: row.id, ancestorPath, depth });
        count += 1;
      }

      await this.audit.record(tx, {
        organizationId: document.organizationId,
        workspaceId: document.workspaceId,
        actorId,
        action: "document.imported",
        entityType: "document",
        entityId: document.id,
        documentId: document.id,
        metadata: { rowCount: count, format: "csv" },
      });
      return count;
    });

    return { importedRows: created };
  }

  private async requireDocument(documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!document) throw new NotFoundException("Document not found");
    return document;
  }
}

export function parseImportCsv(csvText: string): ParsedImportRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.trim().toLowerCase());
  const idx = {
    level: header.indexOf("level"),
    type: header.indexOf("type"),
    title: header.indexOf("title"),
    description: header.indexOf("description"),
  };
  if (idx.type === -1 || idx.title === -1) {
    throw new UnprocessableEntityException("CSV must have at least 'type' and 'title' columns");
  }
  const result: ParsedImportRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i] ?? "");
    const rawType = (cells[idx.type] ?? "").trim() as RowType;
    if (!VALID_ROW_TYPES.includes(rawType)) continue;
    const level = idx.level >= 0 ? Math.max(0, parseInt(cells[idx.level] ?? "0", 10) || 0) : 0;
    result.push({
      level,
      rowType: rawType,
      title: (cells[idx.title] ?? "").trim(),
      description: idx.description >= 0 ? (cells[idx.description] ?? "").trim() : "",
    });
  }
  return result;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
