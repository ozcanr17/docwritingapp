import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationImpactSummary } from "./OperationImpactSummary";

describe("OperationImpactSummary", () => {
  it("explains an operation with accessible impact metrics", () => {
    render(<OperationImpactSummary
      description="Three objects will be removed."
      metrics={[
        { key: "objects", label: "Affected objects", value: 3 },
        { key: "links", label: "Link references", value: 2 },
      ]}
      warning="Linked objects will be audited."
    />);
    expect(screen.getByTestId("operation-impact-summary")).toHaveAccessibleName("\u0130\u015flem etkisi");
    expect(screen.getByText("Affected objects").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Link references").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("Linked objects will be audited.")).toBeInTheDocument();
  });
});
