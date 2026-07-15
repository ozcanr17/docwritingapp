import { describe, expect, it } from "vitest";
import { numberRows, toCsv, toDocx, toPdf, toReqif, toXlsx } from "../src/export";

const rawRows = [
  { id: "a", parentId: null, rank: "b", depth: 0, rowType: "heading", title: "Intro", description: null },
  { id: "b", parentId: "a", rank: "b", depth: 1, rowType: "requirement", title: "Login", description: "User logs in" },
  { id: "c", parentId: "a", rank: "n", depth: 1, rowType: "requirement", title: "Logout", description: null },
  { id: "d", parentId: null, rank: "n", depth: 0, rowType: "heading", title: "Scope", description: null },
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

  it("produces CSV with a header and escaped cells", () => {
    const csv = toCsv(numberRows(rawRows)).toString("utf8");
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,level,type,requirement_no,title,test_step,expected_result,test_result,description");
    expect(lines).toContain("1.1,1,requirement,,Login,,,,User logs in");
  });

  it("escapes commas and quotes in CSV", () => {
    const csv = toCsv(
      numberRows([
        { id: "x", parentId: null, rank: "b", depth: 0, rowType: "note", title: 'A, B "C"', description: null },
      ]),
    ).toString("utf8");
    expect(csv).toContain('"A, B ""C"""');
  });

  it("produces a DOCX (zip) buffer", async () => {
    const buffer = await toDocx("Spec", numberRows(rawRows));
    expect(buffer.length).toBeGreaterThan(0);
    // DOCX files are ZIP archives; the magic bytes are "PK".
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
});
