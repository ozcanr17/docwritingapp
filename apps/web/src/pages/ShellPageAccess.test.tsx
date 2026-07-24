import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import i18n from "../lib/i18n";
import { DocumentAccessBanner } from "./ShellPage";

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
});
