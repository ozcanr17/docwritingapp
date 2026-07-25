import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "../lib/i18n";
import { AppSidebar } from "./AppSidebar";

function renderSidebar(overrides: Partial<React.ComponentProps<typeof AppSidebar>> = {}) {
  const props: React.ComponentProps<typeof AppSidebar> = {
    collapsed: false,
    collapseDisabled: false,
    width: 288,
    title: "Documents",
    subtitle: "Main Workspace",
    onToggleCollapse: vi.fn(),
    children: <div data-testid="context-slot">sections</div>,
    ...overrides,
  };
  render(<AppSidebar {...props} />);
  return props;
}

describe("AppSidebar", () => {
  it("names the current area and renders its contextual sections", () => {
    renderSidebar();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Main Workspace")).toBeInTheDocument();
    expect(screen.getByTestId("context-slot")).toBeInTheDocument();
  });

  it("collapses to an icon strip and hides contextual sections", () => {
    const props = renderSidebar({ collapsed: true });
    expect(screen.queryByTestId("context-slot")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("toggle-sidebar"));
    expect(props.onToggleCollapse).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: i18n.t("expandSidebar") })).toBeInTheDocument();
  });

  it("hides the collapse control when the viewport forces compact mode", () => {
    renderSidebar({ collapseDisabled: true, responsiveCollapsed: true });
    expect(screen.queryByTestId("toggle-sidebar")).not.toBeInTheDocument();
  });
});
