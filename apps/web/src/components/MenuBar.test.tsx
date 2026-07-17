import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MenuBar } from "./MenuBar";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn(async () => []) };
});

describe("MenuBar", () => {
  it("places global search in the application menu bar", () => {
    const onOpenSearch = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MenuBar documentId={null} documentType={null} view="documents" setView={vi.fn()} onOpenReport={vi.fn()} onOpenSearch={onOpenSearch} onCloseSearch={vi.fn()} searchQuery="" onSearchQueryChange={vi.fn()} searchOpen={false} />
      </QueryClientProvider>,
    );
    fireEvent.focus(screen.getByTestId("global-search-input"));
    expect(onOpenSearch).toHaveBeenCalledOnce();
  });

  it("writes the workspace query directly in the top search field", () => {
    const onSearchQueryChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MenuBar documentId={null} documentType={null} view="documents" setView={vi.fn()} onOpenReport={vi.fn()} onOpenSearch={vi.fn()} onCloseSearch={vi.fn()} searchQuery="" onSearchQueryChange={onSearchQueryChange} searchOpen={false} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId("global-search-input"), { target: { value: "REQ-42" } });
    expect(onSearchQueryChange).toHaveBeenCalledWith("REQ-42");
  });

  it("renders top-level menus outside the clipping menu bar", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MenuBar documentId={null} documentType={null} view="documents" setView={vi.fn()} onOpenReport={vi.fn()} onOpenSearch={vi.fn()} onCloseSearch={vi.fn()} searchQuery="" onSearchQueryChange={vi.fn()} searchOpen={false} />
      </QueryClientProvider>,
    );
    for (const menu of ["file", "edit", "view", "insert", "help"]) {
      fireEvent.click(screen.getByTestId(`menu-${menu}`));
      expect(screen.getByTestId(`menu-${menu}-popover`).parentElement).toBe(document.body);
      fireEvent.click(screen.getByTestId(`menu-${menu}`));
    }
  });

  it("opens the release readiness center from analysis", () => {
    const onOpenReport = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MenuBar documentId="document" documentType="requirement" view="documents" setView={vi.fn()} onOpenReport={onOpenReport} onOpenSearch={vi.fn()} onCloseSearch={vi.fn()} searchQuery="" onSearchQueryChange={vi.fn()} searchOpen={false} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("menu-analysis"));
    fireEvent.click(screen.getByTestId("menuitem-readiness"));
    expect(onOpenReport).toHaveBeenCalledWith("readiness");
  });
});
