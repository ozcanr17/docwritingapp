import { PrismaClient } from "@docsys/database";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { createStorage, StorageConfig } from "./storage";

export interface ExportRow {
  id: string;
  parentId: string | null;
  rank: string;
  depth: number;
  rowType: string;
  title: string;
  description: string | null;
  displayNumber: string;
}

export function numberRows(
  rows: Array<{ id: string; parentId: string | null; rank: string; depth: number; rowType: string; title: string; description: string | null }>,
): ExportRow[] {
  const childrenByParent = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentId, list);
  }
  const result: ExportRow[] = [];
  const visit = (parentId: string | null, prefix: string) => {
    const children = (childrenByParent.get(parentId) ?? []).slice().sort((a, b) => (a.rank < b.rank ? -1 : 1));
    children.forEach((child, index) => {
      const displayNumber = prefix === "" ? `${index + 1}` : `${prefix}.${index + 1}`;
      result.push({ ...child, displayNumber });
      visit(child.id, displayNumber);
    });
  };
  visit(null, "");
  return result;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: ExportRow[]): Buffer {
  const header = ["number", "level", "type", "title", "description"].join(",");
  const lines = rows.map((row) =>
    [row.displayNumber, String(row.depth), row.rowType, row.title, row.description ?? ""]
      .map((cell) => csvCell(cell))
      .join(","),
  );
  return Buffer.from([header, ...lines].join("\n"), "utf8");
}

export async function toDocx(title: string, rows: ExportRow[]): Promise<Buffer> {
  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    ...rows.map((row) => {
      if (row.rowType === "heading") {
        return new Paragraph({ text: `${row.displayNumber}  ${row.title}`, heading: HeadingLevel.HEADING_2 });
      }
      return new Paragraph({
        children: [
          new TextRun({ text: `${row.displayNumber}  `, bold: true }),
          new TextRun({ text: row.title }),
          ...(row.description ? [new TextRun({ text: `  — ${row.description}`, italics: true })] : []),
        ],
      });
    }),
  ];
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function runExport(
  prisma: PrismaClient,
  storageConfig: StorageConfig,
  exportJobId: string,
  onProgress: (progress: number) => Promise<void>,
): Promise<void> {
  const job = await prisma.exportJob.findUnique({ where: { id: exportJobId } });
  if (!job || !job.documentId) throw new Error("Export job or document missing");
  await prisma.exportJob.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date(), progress: 5 },
  });
  await onProgress(5);

  const document = await prisma.document.findUniqueOrThrow({ where: { id: job.documentId } });
  const rawRows = await prisma.documentRow.findMany({
    where: { documentId: job.documentId, deletedAt: null },
    orderBy: [{ depth: "asc" }, { rank: "asc" }],
    select: { id: true, parentId: true, rank: true, depth: true, rowType: true, title: true, description: true },
  });
  const numbered = numberRows(rawRows);
  await prisma.exportJob.update({ where: { id: job.id }, data: { progress: 40 } });
  await onProgress(40);

  const isDocx = job.jobType === "docx";
  const body = isDocx ? await toDocx(document.title, numbered) : toCsv(numbered);
  const contentType = isDocx
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "text/csv";
  const storageKey = `exports/${job.organizationId}/${job.id}.${isDocx ? "docx" : "csv"}`;

  const storage = createStorage(storageConfig);
  await storage.ensureBucket();
  await storage.put(storageKey, body, contentType);
  await onProgress(90);

  await prisma.exportJob.update({
    where: { id: job.id },
    data: { status: "completed", progress: 100, finishedAt: new Date(), resultStorageKey: storageKey },
  });
  await onProgress(100);
}
