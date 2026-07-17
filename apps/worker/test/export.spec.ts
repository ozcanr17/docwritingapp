import { describe, expect, it } from "vitest";
import { numberRows, toCsv, toDocx, toPdf, toReqif, toTraceabilityDocx, toTraceabilityXlsx, toXlsx } from "../src/export";

const rawRows = [
  { id: "a", objectNumber: 1, parentId: null, rank: "b", depth: 0, rowType: "heading", title: "Intro", description: null },
  { id: "b", objectNumber: 2, parentId: "a", rank: "b", depth: 1, rowType: "requirement", title: "Login", description: "User logs in" },
  { id: "c", objectNumber: 3, parentId: "a", rank: "n", depth: 1, rowType: "requirement", title: "Logout", description: null },
  { id: "d", objectNumber: 4, parentId: null, rank: "n", depth: 0, rowType: "heading", title: "Scope", description: null },
];

describe("export generation", () => {
  it("derives display numbers from hierarchy and sibling rank", () => {
    const numbered = numberRows(rawRows);
    const byTitle = new Map(numbered.map((r) => [r.title, r.displayNumber]));
    expect(byTitle.get("Intro")).toBe("1");
    expect(byTitle.get("Login")).toBe("1.1");
    expect(byTitle.get("Logout")).toBe("1.2");
    expect(byTitle.get("Scope")).toBe("2");
  });

  it("continues display numbers from an explicit start", () => {
    const numbered = numberRows([
      { id: "start", objectNumber: 10, numberingStart: 4, parentId: null, rank: "b", depth: 0, rowType: "heading", title: "Start", description: null },
      { id: "next", objectNumber: 11, parentId: null, rank: "n", depth: 0, rowType: "heading", title: "Next", description: null },
    ]);
    expect(numbered.map((row) => row.displayNumber)).toEqual(["4", "5"]);
  });

  it("produces CSV with a header and escaped cells", () => {
    const csv = toCsv(numberRows(rawRows)).toString("utf8");
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,level,type,requirement_no,title,step_no,test_step,expected_result,test_result,description");
    expect(lines).toContain("2,1,requirement,,Login,,,,,User logs in");
  });

  it("escapes commas and quotes in CSV", () => {
    const csv = toCsv(
      numberRows([
        { id: "x", objectNumber: 1, parentId: null, rank: "b", depth: 0, rowType: "note", title: 'A, B "C"', description: null },
      ]),
    ).toString("utf8");
    expect(csv).toContain('"A, B ""C"""');
  });

  it("produces a DOCX (zip) buffer", async () => {
    const buffer = await toDocx("Spec", numberRows(rawRows), "requirement", "tr");
    expect(buffer.length).toBeGreaterThan(0);
    // DOCX files are ZIP archives; the magic bytes are "PK".
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("renders test document columns and stable object ids into DOCX", async () => {
    const testRows = numberRows([
      { id: "tc", objectNumber: 4, parentId: null, rank: "b", depth: 0, rowType: "test_case", title: "Yaz\u0131l\u0131m Konfig\u00fcrasyon Testi", description: null },
      { id: "ts", objectNumber: 5, parentId: "tc", rank: "b", depth: 1, rowType: "test_step", title: "", action: "Butona bas", expectedResult: "Ekran a\u00e7\u0131l\u0131r", linkedRequirementNos: ["REQ-001"], description: null },
    ]);
    expect(testRows[1]?.stepNumber).toBe(1);
    const buffer = await toDocx("Test Spec", testRows, "test", "tr");
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("produces XLSX, PDF and ReqIF artifacts", async () => {
    const rows = numberRows(rawRows);
    const xlsx = await toXlsx("Spec", rows);
    const pdf = await toPdf("Spec", rows);
    const reqif = toReqif("Spec", rows, []);
    expect(xlsx.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(reqif.toString("utf8")).toContain("<REQ-IF");
    expect(reqif.toString("utf8")).toContain("REQ-IF-VERSION>1.2");
  });

  it("produces bidirectional traceability XLSX and DOCX artifacts", async () => {
    const matrix = [{
      id: "test-1",
      primary: "Authentication verification",
      documentTitle: "Verification Tests",
      related: [
        { id: "req-1", label: "GER-001", description: "Login requirement", suspect: false },
        { id: "req-2", label: "GER-002", description: "Lockout requirement", suspect: true },
      ],
    }];
    const xlsx = await toTraceabilityXlsx("Verification Tests", matrix, "test_to_requirement", "tr");
    const docx = await toTraceabilityDocx("Verification Tests", matrix, "test_to_requirement", "tr");
    expect(xlsx.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(docx.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
