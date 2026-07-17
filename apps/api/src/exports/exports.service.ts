import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { DocumentType, RowType } from "@docsys/database";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";
import { rankBetween } from "../common/rank";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ExportQueue } from "./export-queue";
import { XMLParser } from "fast-xml-parser";
import { randomUUID } from "crypto";
import ExcelJS from "exceljs";

export type ExportFormat = "csv" | "docx" | "xlsx" | "pdf" | "reqif";

interface ParsedImportRow {
  level: number;
  rowType: RowType;
  title: string;
  description: string;
  requirementNo: string;
  action: string;
  expectedResult: string;
  testResult: string;
}

const VALID_ROW_TYPES: RowType[] = ["heading", "requirement", "test_case", "test_step", "note"];

const ALLOWED_ROW_TYPES: Record<DocumentType, RowType[]> = {
  requirement: ["heading", "requirement", "note"],
  test: ["heading", "test_case", "test_step", "note"],
  general_document: [],
};

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly queue: ExportQueue,
  ) {}

  async createExport(
    actorId: string,
    documentId: string,
    format: ExportFormat,
    templateId?: string,
    locale: "tr" | "en" = "tr",
    scope: "document" | "traceability" = "document",
    traceabilityDirection: "requirement_to_test" | "test_to_requirement" = "requirement_to_test",
  ) {
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
        parameters: { format, locale, scope, traceabilityDirection, ...(templateId ? { templateId } : {}) },
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
    const extension = job.jobType === "docx" ? "docx" : job.jobType === "xlsx" ? "xlsx" : job.jobType === "pdf" ? "pdf" : job.jobType === "reqif" ? "reqif" : "csv";
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
    if (rows.some((row) => !ALLOWED_ROW_TYPES[document.documentType].includes(row.rowType))) {
      throw new UnprocessableEntityException("CSV contains row types that are not allowed in this document type");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${document.id}::text, 0))`;
      const counter = await tx.document.update({
        where: { id: document.id },
        data: { nextObjectNumber: { increment: rows.length } },
        select: { nextObjectNumber: true },
      });
      let objectNumber = counter.nextObjectNumber - rows.length;
      const stack: { id: string; ancestorPath: string; depth: number; rowType: RowType }[] = [];
      const lastRankByParent = new Map<string | null, string>();
      let count = 0;
      let requirementSequence = await tx.requirementDetail.count({ where: { row: { documentId: document.id } } });

      for (const parsed of rows) {
        while (stack.length > parsed.level) stack.pop();
        const parent = stack.length > 0 ? stack[stack.length - 1] : null;
        if (parent && !isAllowedParent(parsed.rowType, parent.rowType)) {
          throw new UnprocessableEntityException("CSV contains an invalid row hierarchy");
        }
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
            objectNumber,
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
        objectNumber += 1;
        if (parsed.rowType === "requirement") {
          requirementSequence += 1;
          await tx.requirementDetail.create({
            data: {
              rowId: row.id,
              requirementNo: parsed.requirementNo || `${document.requirementPrefix}-${String(requirementSequence).padStart(3, "0")}`,
            },
          });
        }
        else if (parsed.rowType === "test_case") await tx.testCaseDetail.create({ data: { rowId: row.id } });
        else if (parsed.rowType === "test_step") await tx.testStepDetail.create({ data: { rowId: row.id, action: parsed.action || null, expectedResult: parsed.expectedResult || null, testResult: parsed.testResult || null } });

        stack.push({ id: row.id, ancestorPath, depth, rowType: parsed.rowType });
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

  async importReqif(actorId: string, documentId: string, reqifText: string) {
    const document = await this.requireDocument(documentId);
    const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true }).parse(reqifText) as unknown;
    const objects = collectNodes(parsed, "SPEC-OBJECT");
    if (objects.length === 0) throw new UnprocessableEntityException("ReqIF contains no specification objects");
    const rows = objects.map((object, index) => {
      const record = object as Record<string, unknown>;
      const identifier = String(record["@_IDENTIFIER"] ?? `${document.requirementPrefix}-${String(index + 1).padStart(3, "0")}`);
      const longName = String(record["@_LONG-NAME"] ?? "");
      const values = collectNodes(record, "ATTRIBUTE-VALUE-STRING") as Array<Record<string, unknown>>;
      const valueText = values.map((value) => String(value["@_THE-VALUE"] ?? "")).find(Boolean) ?? longName;
      return { identifier, title: valueText || longName || identifier };
    });
    const csv = [
      "level,type,requirement_no,title,description",
      ...rows.map((row) => `0,requirement,${csvCell(row.identifier)},${csvCell(row.title)},`),
    ].join("\n");
    return this.importCsv(actorId, documentId, csv);
  }

  async importXlsx(actorId: string, documentId: string, base64: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(base64, "base64") as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new UnprocessableEntityException("XLSX contains no worksheet");
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => headers.set(String(cell.text).trim().toLowerCase().replace(/\s+/g, "_"), column));
    const cell = (row: ExcelJS.Row, ...names: string[]) => {
      const column = names.map((name) => headers.get(name)).find((value) => value !== undefined);
      return column ? row.getCell(column).text.trim() : "";
    };
    const lines = ["level,type,requirement_no,title,description,test_step,expected_result,test_result"];
    for (let index = 2; index <= sheet.rowCount; index += 1) {
      const row = sheet.getRow(index);
      const type = cell(row, "type", "t\u00fcr");
      if (!VALID_ROW_TYPES.includes(type as RowType)) continue;
      const id = cell(row, "id", "level");
      const level = /^\d+(\.\d+)*$/.test(id) ? id.split(".").length - 1 : Math.max(0, Number(id) || 0);
      const values = [String(level), type, cell(row, "requirement_no", "gereksinim_no"), cell(row, "title", "ba\u015fl\u0131k"), cell(row, "description", "a\u00e7\u0131klama"), cell(row, "test_step", "test_ad\u0131m\u0131"), cell(row, "expected_result", "beklenen_sonu\u00e7"), cell(row, "test_result", "test_sonucu")];
      lines.push(values.map(csvCell).join(","));
    }
    return this.importCsv(actorId, documentId, lines.join("\n"));
  }

  async listTemplates(actorId: string, organizationId: string) {
    await this.access.assertPermission(actorId, "document.read", { organizationId });
    return this.prisma.exportTemplate.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, documentType: true, version: true, createdAt: true },
    });
  }

  async createTemplate(
    actorId: string,
    organizationId: string,
    input: { name: string; documentType: DocumentType; fileName: string },
  ) {
    await this.access.assertPermission(actorId, "document.manage", { organizationId });
    const storageKey = `templates/${organizationId}/${randomUUID()}.docx`;
    const template = await this.prisma.exportTemplate.create({
      data: {
        organizationId,
        name: input.name,
        documentType: input.documentType,
        storageKey,
        createdById: actorId,
      },
    });
    return { id: template.id, uploadUrl: await this.storage.presignedUploadUrl(storageKey), fileName: input.fileName };
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
    requirementNo: header.indexOf("requirement_no"),
    action: header.indexOf("test_step"),
    expectedResult: header.indexOf("expected_result"),
    testResult: header.indexOf("test_result"),
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
      requirementNo: idx.requirementNo >= 0 ? (cells[idx.requirementNo] ?? "").trim() : "",
      action: idx.action >= 0 ? (cells[idx.action] ?? "").trim() : "",
      expectedResult: idx.expectedResult >= 0 ? (cells[idx.expectedResult] ?? "").trim() : "",
      testResult: idx.testResult >= 0 ? (cells[idx.testResult] ?? "").trim() : "",
    });
  }
  return result;
}

function isAllowedParent(rowType: RowType, parentType: RowType): boolean {
  if (rowType === "test_step") return parentType === "test_case" || parentType === "heading";
  if (rowType === "heading") return parentType === "heading" || parentType === "test_case";
  if (rowType === "requirement") return parentType === "heading" || parentType === "requirement";
  if (rowType === "test_case") return parentType === "heading";
  return true;
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

function collectNodes(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectNodes(item, key));
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const direct = record[key];
  return [
    ...(direct === undefined ? [] : Array.isArray(direct) ? direct : [direct]),
    ...Object.entries(record).filter(([entryKey]) => entryKey !== key).flatMap(([, child]) => collectNodes(child, key)),
  ];
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
