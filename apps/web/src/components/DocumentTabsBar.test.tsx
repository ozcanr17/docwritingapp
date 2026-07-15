import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentTabsBar } from "./DocumentTabsBar";

const tabs = [
  { id: "requirements", title: "Requirements", documentType: "requirement" as const },
  { id: "tests", title: "Tests", documentType: "test" as const },
];

describe("DocumentTabsBar", () => {
  it("activates, closes and splits open documents", () => {
    const activate = vi.fn();
    const close = vi.fn();
    const split = vi.fn();
    render(<DocumentTabsBar tabs={tabs} activeId="requirements" secondaryId={null} onActivate={activate} onClose={close} onSecondaryChange={split} onOpenWindow={vi.fn()} />);
    fireEvent.click(screen.getByTestId("document-tab-tests"));
    expect(activate).toHaveBeenCalledWith("tests");
    fireEvent.change(screen.getByTestId("split-document-select"), { target: { value: "tests" } });
    expect(split).toHaveBeenCalledWith("tests");
    fireEvent.click(screen.getByTestId("close-document-tab-tests"));
    expect(close).toHaveBeenCalledWith("tests");
  });
});
