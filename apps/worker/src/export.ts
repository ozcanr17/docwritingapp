import { PrismaClient } from "@docsys/database";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { createStorage, StorageConfig } from "./storage";

export interface ExportRow {
  id: string;
  objectNumber: number;
  numberingStart?: number | null;
  parentId: string | null;
  rank: string;
  depth: number;
  rowType: string;
  title: string;
  description: string | null;
  requirementNo?: string | null;
  action?: string | null;
  expectedResult?: string | null;
  testResult?: string | null;
  displayNumber: string;
  stepNumber: number | null;
  linkedRequirementNos: string[];
}

export function numberRows(
  rows: Array<{
    id: string;
    objectNumber: number;
    numberingStart?: number | null;
    parentId: string | null;
    rank: string;
    depth: number;
    rowType: string;
    title: string;
    description: string | null;
    requirementNo?: string | null;
    action?: string | null;
    expectedResult?: string | null;
    testResult?: string | null;
    linkedRequirementNos?: string[];
  }>,
): ExportRow[] {
  const childrenByParent = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const list = childrenByParent.get(row.parentId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentId, list);
  }
  const result: ExportRow[] = [];
  const stepNumbers = new Map<string, number>();
  const visit = (parentId: string | null, prefix: string) => {
    const children = (childrenByParent.get(parentId) ?? []).slice().sort((a, b) => (a.rank < b.rank ? -1 : 1));
    let nextSegment = 1;
    children.forEach((child) => {
      const segment = child.numberingStart ?? nextSegment;
      const displayNumber = prefix === "" ? `${segment}` : `${prefix}.${segment}`;
      nextSegment = segment + 1;
      const key = child.parentId ?? "root";
      const stepNumber = child.rowType === "test_step" ? (stepNumbers.get(key) ?? 0) + 1 : null;
      if (stepNumber !== null) stepNumbers.set(key, stepNumber);
      result.push({ ...child, displayNumber, stepNumber, linkedRequirementNos: child.linkedRequirementNos ?? [] });
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
  const header = ["id", "level", "type", "requirement_no", "title", "step_no", "test_step", "expected_result", "test_result", "description"].join(",");
  const lines = rows.map((row) =>
    [
      String(row.objectNumber),
      String(row.depth),
      row.rowType,
      row.requirementNo ?? "",
      row.title,
      row.stepNumber === null ? "" : String(row.stepNumber),
      row.action ?? "",
      row.expectedResult ?? "",
      row.testResult ?? "",
      row.description ?? "",
    ]
      .map((cell) => csvCell(cell))
      .join(","),
  );
  return Buffer.from([header, ...lines].join("\n"), "utf8");
}

type ExportLocale = "tr" | "en";

const TABLE_WIDTH = 9360;
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 2, color: "B8C0CA" },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: "B8C0CA" },
  left: { style: BorderStyle.SINGLE, size: 2, color: "B8C0CA" },
  right: { style: BorderStyle.SINGLE, size: 2, color: "B8C0CA" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "D7DCE2" },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "D7DCE2" },
};

function tableCell(text: string, width: number, options: { header?: boolean; bold?: boolean; center?: boolean; muted?: boolean } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    ...(options.header ? { shading: { type: ShadingType.CLEAR, fill: "E8EEF5", color: "auto" } } : {}),
    children: [
      new Paragraph({
        alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 240 },
        children: [new TextRun({ text, bold: Boolean(options.header || options.bold), size: options.header ? 17 : 16, color: options.muted ? "667085" : "172033", font: "Calibri" })],
      }),
    ],
  });
}

function titleFor(row: ExportRow): string {
  return row.rowType === "heading" || row.rowType === "test_case"
    ? `${row.displayNumber} ${row.title}`.trim()
    : row.title;
}

function documentTable(rows: ExportRow[], documentType: "requirement" | "test", locale: ExportLocale): Table {
  const tr = locale === "tr";
  const requirementWidths = [620, 1500, 3540, 1160, 2540];
  const testWidths = [560, 1760, 620, 1450, 1450, 1050, 1000, 1470];
  const widths = documentType === "requirement" ? requirementWidths : testWidths;
  const headers = documentType === "requirement"
    ? tr ? ["ID", "Gereksinim No", "Dok\u00fcman \u0130\u00e7eri\u011fi", "Nitelik", "A\u00e7\u0131klama"] : ["ID", "Requirement No", "Document Content", "Type", "Description"]
    : tr ? ["ID", "Dok\u00fcman \u0130\u00e7eri\u011fi", "Ad\u0131m No", "Test Ad\u0131m\u0131", "Beklenen Sonu\u00e7", "Gereksinim No", "Test Sonucu", "A\u00e7\u0131klama"] : ["ID", "Document Content", "Step No", "Test Step", "Expected Result", "Requirement No", "Test Result", "Description"];
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((value, index) => tableCell(value, widths[index]!, { header: true, center: index === 0 || (documentType === "test" && index === 2) })),
  });
  const body = rows.map((row) => {
    const heading = row.rowType === "heading" || row.rowType === "test_case";
    const values = documentType === "requirement"
      ? [String(row.objectNumber), row.requirementNo ?? "", titleFor(row), tr ? row.rowType === "heading" ? "Ba\u015fl\u0131k" : row.rowType === "requirement" ? "Gereksinim" : "Not" : row.rowType, row.description ?? ""]
      : [String(row.objectNumber), titleFor(row), row.stepNumber === null ? "" : `${row.stepNumber}.`, row.action ?? "", row.expectedResult ?? "", row.linkedRequirementNos.join("\n"), row.testResult ?? "", row.description ?? ""];
    return new TableRow({
      cantSplit: true,
      children: values.map((value, index) => tableCell(value, widths[index]!, { bold: heading && index === 2 - (documentType === "test" ? 1 : 0), center: index === 0 || (documentType === "test" && index === 2), muted: !value })),
    });
  });
  return new Table({
    rows: [header, ...body],
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    indent: { size: 120, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    margins: CELL_MARGINS,
    borders: TABLE_BORDERS,
  });
}

export async function toDocx(title: string, rows: ExportRow[], documentType: "requirement" | "test" = "requirement", locale: ExportLocale = "tr"): Promise<Buffer> {
  const label = locale === "tr"
    ? documentType === "test" ? "Test dok\u00fcman\u0131" : "Gereksinim dok\u00fcman\u0131"
    : documentType === "test" ? "Test document" : "Requirements document";
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22, color: "172033" }, paragraph: { spacing: { after: 120, line: 300 } } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080, header: 708, footer: 708 },
        },
      },
      children: [
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: title, bold: true, size: 30, color: "172033", font: "Calibri" })],
        }),
        new Paragraph({
          spacing: { before: 0, after: 180 },
          children: [new TextRun({ text: label, size: 18, color: "667085", font: "Calibri" })],
        }),
        documentTable(rows, documentType, locale),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

export function toTemplatedDocx(template: Buffer, title: string, rows: ExportRow[]): Buffer {
  const document = new Docxtemplater(new PizZip(template), { paragraphLoop: true, linebreaks: true });
  document.render({
    title,
    generatedAt: new Date().toISOString(),
    rows: rows.map((row) => ({
      id: row.objectNumber,
      outlineNumber: row.displayNumber,
      type: row.rowType,
      requirementNo: row.requirementNo ?? "",
      title: row.title,
      stepNumber: row.stepNumber ?? "",
      action: row.action ?? "",
      expectedResult: row.expectedResult ?? "",
      testResult: row.testResult ?? "",
      description: row.description ?? "",
    })),
  });
  return document.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

export async function toXlsx(title: string, rows: ExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DocSys";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(title.slice(0, 31) || "Document", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  sheet.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "Outline", key: "outline", width: 14 },
    { header: "Type", key: "type", width: 18 },
    { header: "Requirement No", key: "requirementNo", width: 22 },
    { header: "Title", key: "title", width: 48 },
    { header: "Step No", key: "stepNumber", width: 12 },
    { header: "Test Step", key: "action", width: 48 },
    { header: "Expected Result", key: "expectedResult", width: 48 },
    { header: "Test Result", key: "testResult", width: 24 },
    { header: "Description", key: "description", width: 56 },
  ];
  for (const row of rows) {
    sheet.addRow({
      id: row.objectNumber,
      outline: row.displayNumber,
      type: row.rowType,
      requirementNo: row.requirementNo ?? "",
      title: row.title,
      stepNumber: row.stepNumber ?? "",
      action: row.action ?? "",
      expectedResult: row.expectedResult ?? "",
      testResult: row.testResult ?? "",
      description: row.description ?? "",
    });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  sheet.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function toPdf(title: string, rows: ExportRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fontSize(20).text(title);
    document.moveDown();
    for (const row of rows) {
      if (document.y > 740) document.addPage();
      document.fontSize(row.rowType === "heading" ? 14 : 10);
      const prefix = [row.displayNumber, row.requirementNo].filter(Boolean).join("  ");
      document.text(`${prefix}  ${row.title}`, { indent: row.depth * 12, continued: false });
      const details = [row.action, row.expectedResult, row.testResult, row.description].filter(Boolean).join(" | ");
      if (details) document.fontSize(8).fillColor("#555555").text(details, { indent: row.depth * 12 + 12 }).fillColor("#000000");
      document.moveDown(0.35);
    }
    document.end();
  });
}

export function toReqif(
  title: string,
  rows: ExportRow[],
  links: Array<{ id: string; sourceRowId: string; targetRowId: string; linkType: string }>,
): Buffer {
  const objectType = "_DOCSYS_OBJECT_TYPE";
  const relationType = "_DOCSYS_RELATION_TYPE";
  const specificationType = "_DOCSYS_SPECIFICATION_TYPE";
  const datatype = "_DOCSYS_STRING";
  const attribute = "_DOCSYS_TITLE";
  const objects = rows.map((row) => `<SPEC-OBJECT IDENTIFIER="_${row.id}" LONG-NAME="${xml(row.requirementNo ?? row.title)}"><VALUES><ATTRIBUTE-VALUE-STRING THE-VALUE="${xml(row.title)}"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>${attribute}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING></VALUES><TYPE><SPEC-OBJECT-TYPE-REF>${objectType}</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT>`).join("");
  const relations = links.map((link) => `<SPEC-RELATION IDENTIFIER="_${link.id}" LONG-NAME="${xml(link.linkType)}"><SOURCE><SPEC-OBJECT-REF>_${link.sourceRowId}</SPEC-OBJECT-REF></SOURCE><TARGET><SPEC-OBJECT-REF>_${link.targetRowId}</SPEC-OBJECT-REF></TARGET><TYPE><SPEC-RELATION-TYPE-REF>${relationType}</SPEC-RELATION-TYPE-REF></TYPE></SPEC-RELATION>`).join("");
  const hierarchy = rows.map((row) => `<SPEC-HIERARCHY IDENTIFIER="_H_${row.id}"><OBJECT><SPEC-OBJECT-REF>_${row.id}</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>`).join("");
  const content = `<?xml version="1.0" encoding="UTF-8"?><REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd"><THE-HEADER><REQ-IF-HEADER IDENTIFIER="_DOCSYS_HEADER"><COMMENT>DocSys ReqIF export</COMMENT><CREATION-TIME>${new Date().toISOString()}</CREATION-TIME><REQ-IF-TOOL-ID>DocSys</REQ-IF-TOOL-ID><REQ-IF-VERSION>1.2</REQ-IF-VERSION><SOURCE-TOOL-ID>DocSys</SOURCE-TOOL-ID><TITLE>${xml(title)}</TITLE></REQ-IF-HEADER></THE-HEADER><CORE-CONTENT><REQ-IF-CONTENT><DATATYPES><DATATYPE-DEFINITION-STRING IDENTIFIER="${datatype}" LONG-NAME="String" MAX-LENGTH="100000"/></DATATYPES><SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="${objectType}" LONG-NAME="DocSys Artifact"><SPEC-ATTRIBUTES><ATTRIBUTE-DEFINITION-STRING IDENTIFIER="${attribute}" LONG-NAME="Title"><TYPE><DATATYPE-DEFINITION-STRING-REF>${datatype}</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING></SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE><SPEC-RELATION-TYPE IDENTIFIER="${relationType}" LONG-NAME="Trace Link"/><SPECIFICATION-TYPE IDENTIFIER="${specificationType}" LONG-NAME="Document"/></SPEC-TYPES><SPEC-OBJECTS>${objects}</SPEC-OBJECTS><SPEC-RELATIONS>${relations}</SPEC-RELATIONS><SPECIFICATIONS><SPECIFICATION IDENTIFIER="_DOCSYS_SPEC" LONG-NAME="${xml(title)}"><CHILDREN>${hierarchy}</CHILDREN><TYPE><SPECIFICATION-TYPE-REF>${specificationType}</SPECIFICATION-TYPE-REF></TYPE></SPECIFICATION></SPECIFICATIONS></REQ-IF-CONTENT></CORE-CONTENT></REQ-IF>`;
  return Buffer.from(content, "utf8");
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
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
    select: {
      id: true,
      objectNumber: true,
      numberingStart: true,
      parentId: true,
      rank: true,
      depth: true,
      rowType: true,
      title: true,
      description: true,
      requirementDetail: { select: { requirementNo: true } },
      testStepDetail: { select: { action: true, expectedResult: true, testResult: true } },
      outgoingLinks: {
        where: { deletedAt: null },
        select: { targetRow: { select: { requirementDetail: { select: { requirementNo: true } } } } },
      },
      incomingLinks: {
        where: { deletedAt: null },
        select: { sourceRow: { select: { requirementDetail: { select: { requirementNo: true } } } } },
      },
    },
  });
  const numbered = numberRows(
    rawRows.map((row) => ({
      ...row,
      requirementNo: row.requirementDetail?.requirementNo ?? null,
      action: row.testStepDetail?.action ?? null,
      expectedResult: row.testStepDetail?.expectedResult ?? null,
      testResult: row.testStepDetail?.testResult ?? null,
      linkedRequirementNos: [
        ...row.outgoingLinks.map((link) => link.targetRow.requirementDetail?.requirementNo),
        ...row.incomingLinks.map((link) => link.sourceRow.requirementDetail?.requirementNo),
      ].filter((value): value is string => Boolean(value)),
    })),
  );
  const links = await prisma.requirementLink.findMany({
    where: {
      deletedAt: null,
      sourceRow: { documentId: job.documentId },
      targetRow: { documentId: job.documentId },
    },
    select: { id: true, sourceRowId: true, targetRowId: true, linkType: true },
  });
  await prisma.exportJob.update({ where: { id: job.id }, data: { progress: 40 } });
  await onProgress(40);

  const storage = createStorage(storageConfig);
  await storage.ensureBucket();
  const parameters = job.parameters as Record<string, unknown>;
  const templateId = typeof parameters.templateId === "string" ? parameters.templateId : null;
  const locale = parameters.locale === "en" ? "en" : "tr";
  const template = templateId ? await prisma.exportTemplate.findFirst({ where: { id: templateId, organizationId: job.organizationId, deletedAt: null } }) : null;
  const docxBody = job.jobType === "docx"
    ? template
      ? toTemplatedDocx(await storage.get(template.storageKey), document.title, numbered)
      : await toDocx(document.title, numbered, document.documentType === "test" ? "test" : "requirement", locale)
    : Buffer.alloc(0);
  const output = job.jobType === "docx"
    ? { body: docxBody, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" }
    : job.jobType === "xlsx"
      ? { body: await toXlsx(document.title, numbered), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" }
      : job.jobType === "pdf"
        ? { body: await toPdf(document.title, numbered), contentType: "application/pdf", extension: "pdf" }
        : job.jobType === "reqif"
          ? { body: toReqif(document.title, numbered, links), contentType: "application/xml", extension: "reqif" }
          : { body: toCsv(numbered), contentType: "text/csv", extension: "csv" };
  const storageKey = `exports/${job.organizationId}/${job.id}.${output.extension}`;

  await storage.put(storageKey, output.body, output.contentType);
  await onProgress(90);

  await prisma.exportJob.update({
    where: { id: job.id },
    data: { status: "completed", progress: 100, finishedAt: new Date(), resultStorageKey: storageKey },
  });
  await onProgress(100);
}
