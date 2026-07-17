import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImpactAnalysis, ReleaseReadinessReport } from "../lib/api";
import { ReleaseReadinessPanel } from "./ReleaseReadinessPanel";

const report: ReleaseReadinessReport = {
  status: "blocked",
  score: 50,
  generatedAt: "2026-07-17T09:00:00.000Z",
  gates: [
    { key: "content", required: true, status: "passed", issueCount: 0 },
    { key: "traceability", required: true, status: "failed", issueCount: 1 },
    { key: "links_current", required: true, status: "failed", issueCount: 1 },
    { key: "verification", required: false, status: "not_applicable", issueCount: 0 },
    { key: "review", required: false, status: "warning", issueCount: 1 },
  ],
  counts: {
    rows: 4,
    requirements: 1,
    testSteps: 0,
    qualityErrors: 0,
    qualityWarnings: 1,
    uncoveredRequirements: 1,
    unlinkedTestSteps: 0,
    incompleteTestSteps: 0,
    unverifiedTestSteps: 0,
    suspectLinks: 1,
    retestCandidates: 1,
    failedLatestExecutions: 0,
  },
  issues: [{ rule: "uncovered_requirement", severity: "warning", rowId: "requirement-row", objectNumber: 7, title: "Emergency shutdown" }],
  retestCandidates: [{ rowId: "test-row", objectNumber: 12, title: "Shutdown test", document: { id: "test-document", title: "Verification", documentType: "test" }, reason: "suspect_link" }],
  failedExecutions: [],
  latestReview: null,
  baseline: { revisionNumber: 1, semanticVersion: "1.0", createdAt: "2026-07-16T09:00:00.000Z", changedRows: 1, removedRows: 0, current: false },
};

const impact: ImpactAnalysis = {
  impactDepth: 2,
  baseline: { revisionNumber: 1, semanticVersion: "1.0", createdAt: "2026-07-16T09:00:00.000Z" },
  changedRows: [{ rowId: "requirement-row", objectNumber: 7, title: "Emergency shutdown", rowType: "requirement" }],
  affectedRowCount: 2,
  traversedLinkCount: 2,
  retestCandidates: [{ rowId: "test-row", objectNumber: 12, title: "Shutdown test", rowType: "test_step", document: { id: "test-document", title: "Verification", documentType: "test" }, reason: "suspect_link", sourceRowIds: ["requirement-row"] }],
};

describe("ReleaseReadinessPanel", () => {
  it("summarizes release gates and opens evidence at its source", () => {
    const openRow = vi.fn();
    const openCandidate = vi.fn();
    render(<ReleaseReadinessPanel report={report} onOpenRow={openRow} onOpenCandidate={openCandidate} />);

    expect(screen.getByTestId("readiness-status")).toHaveAttribute("data-status", "blocked");
    expect(screen.getByTestId("readiness-gate-traceability")).toHaveAttribute("data-status", "failed");
    expect(screen.getByTestId("readiness-why-requirement-row")).not.toBeEmptyDOMElement();
    fireEvent.click(screen.getByTestId("readiness-issue-requirement-row"));
    fireEvent.click(screen.getByTestId("readiness-retest-test-row"));

    expect(openRow).toHaveBeenCalledWith("requirement-row");
    expect(openCandidate).toHaveBeenCalledWith(report.retestCandidates[0]);
  });

  it("creates a selected retest package from configurable impact", () => {
    const createPackage = vi.fn();
    const changeDepth = vi.fn();
    render(<ReleaseReadinessPanel report={report} impact={impact} impactDepth={2} onOpenRow={vi.fn()} onOpenCandidate={vi.fn()} onImpactDepthChange={changeDepth} onCreatePackage={createPackage} />);
    expect(screen.getByTestId("retest-candidate-test-row")).toBeChecked();
    fireEvent.change(screen.getByTestId("impact-depth"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("retest-package-name"), { target: { value: "Release verification" } });
    fireEvent.click(screen.getByTestId("create-retest-package"));
    expect(changeDepth).toHaveBeenCalledWith(3);
    expect(createPackage).toHaveBeenCalledWith("Release verification", ["test-row"], 2);
  });
});
