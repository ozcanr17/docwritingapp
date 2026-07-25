import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentActionsMenu } from "./DocumentActionsMenu";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn(async () => []) };
});

function renderMenu(overrides: Partial<React.ComponentProps<typeof DocumentActionsMenu>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props: React.ComponentProps<typeof DocumentActionsMenu> = {
    documentId: "document-1",
    documentType: "requirement",
    canManageAccess: false,
    onOpenReport: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenAccess: vi.fn(),
    ...overrides,
  };
  render(
    <QueryClientProvider client={client}>
      <DocumentActionsMenu {...props} />
    </QueryClientProvider>,
  );
  return props;
}

describe("DocumentActionsMenu", () => {
  it("renders the menu outside the clipping toolbar", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("document-actions"));
    expect(screen.getByTestId("document-actions-popover").parentElement).toBe(document.body);
  });

  it("opens the release readiness center from analysis", () => {
    const props = renderMenu();
    fireEvent.click(screen.getByTestId("document-actions"));
    fireEvent.click(screen.getByTestId("menuitem-analysis"));
    fireEvent.click(screen.getByTestId("menuitem-readiness"));
    expect(props.onOpenReport).toHaveBeenCalledWith("readiness");
  });

  it("opens document history", () => {
    const props = renderMenu();
    fireEvent.click(screen.getByTestId("document-actions"));
    fireEvent.click(screen.getByTestId("menuitem-document-history"));
    expect(props.onOpenHistory).toHaveBeenCalledWith("document");
  });

  it("groups import, export, baselines, insert and columns", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("document-actions"));
    for (const key of ["import", "export", "baselines", "insert", "columns"]) {
      expect(screen.getByTestId(`menuitem-${key}`)).toBeInTheDocument();
    }
  });

  it("shows the permissions entry only for access managers", () => {
    const props = renderMenu({ canManageAccess: true });
    fireEvent.click(screen.getByTestId("document-actions"));
    fireEvent.click(screen.getByTestId("menuitem-permissions"));
    expect(props.onOpenAccess).toHaveBeenCalledOnce();
  });

  it("hides grid-only operations for general documents without manage rights", () => {
    renderMenu({ documentType: "general_document" });
    expect(screen.queryByTestId("document-actions")).not.toBeInTheDocument();
  });
});
