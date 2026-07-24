import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "../lib/i18n";
import { DocumentAccessBanner, SplitResizeHandle } from "./ShellPage";

describe("document access presentation", () => {
  it("makes read-only access explicit outside split view", () => {
    render(
      <DocumentAccessBanner
        title="Requirements"
        split={false}
        focused
        readOnly
        canManageAccess={false}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      i18n.t("readOnlyDocumentNotice"),
    );
    expect(screen.getByText(i18n.t("readOnly"))).toBeInTheDocument();
  });

  it("shows focus and access-management context in split view", () => {
    render(
      <DocumentAccessBanner
        title="Verification"
        split
        focused
        readOnly={false}
        canManageAccess
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Verification");
    expect(screen.getByText(i18n.t("focusedPane"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("accessManager"))).toBeInTheDocument();
  });

  it("exposes split resizing semantics and keyboard limits", () => {
    const onChange = vi.fn();
    render(<SplitResizeHandle direction="horizontal" ratio={0.5} onChange={onChange} />);
    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("aria-valuemin", "20");
    expect(separator).toHaveAttribute("aria-valuemax", "80");
    expect(separator).toHaveAttribute("aria-valuenow", "50");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(0.55);
    fireEvent.keyDown(separator, { key: "Home" });
    expect(onChange).toHaveBeenCalledWith(0.2);
  });
});
