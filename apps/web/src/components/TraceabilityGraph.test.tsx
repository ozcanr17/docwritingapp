import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TraceabilityGraph, TraceMatrixRow } from "./TraceabilityGraph";

const rows: TraceMatrixRow[] = [{
  id: "requirement",
  requirementNo: "REQ-042",
  title: "Emergency shutdown",
  links: [{
    linkId: "link",
    suspect: true,
    linkType: "verifies",
    sourceId: "test",
    sourceScenarioId: "scenario",
    sourceTitle: "Shutdown test",
    sourceType: "test_step",
    sourceDocument: { id: "test-document", title: "Verification tests", documentType: "test" },
  }],
}];

describe("TraceabilityGraph", () => {
  it("opens source and requirement nodes from the visual graph", () => {
    const openRequirement = vi.fn();
    const openSource = vi.fn();
    render(<TraceabilityGraph rows={rows} query="" suspectOnly={false} onOpenRequirement={openRequirement} onOpenSource={openSource} />);
    fireEvent.click(screen.getByRole("button", { name: /Shutdown test/ }));
    fireEvent.click(screen.getByRole("button", { name: /REQ-042/ }));
    expect(openSource).toHaveBeenCalledWith(rows[0]?.links[0]);
    expect(openRequirement).toHaveBeenCalledWith("requirement");
  });

  it("filters relationships by text and suspect state", () => {
    const { rerender } = render(<TraceabilityGraph rows={rows} query="missing" suspectOnly={false} onOpenRequirement={vi.fn()} onOpenSource={vi.fn()} />);
    expect(screen.getByText("Bu g\u00f6r\u00fcn\u00fcmle e\u015fle\u015fen izlenebilirlik ili\u015fkisi yok.")).toBeInTheDocument();
    rerender(<TraceabilityGraph rows={rows} query="shutdown" suspectOnly onOpenRequirement={vi.fn()} onOpenSource={vi.fn()} />);
    expect(screen.getByTestId("traceability-graph")).toBeInTheDocument();
  });
});
