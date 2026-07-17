import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { useDocumentTabsStore } from "../stores/documentTabs";
import { TreePanel } from "./TreePanel";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn(async () => ({ folders: [], documents: [] })) };
});

function renderTree() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["folders", "workspace-1"], [{ id: "folder-1", name: "Target", parentId: null, version: 1, ancestorPath: "", depth: 0 }]);
  client.setQueryData(["tree", "workspace-1", null], {
    folders: [{ id: "folder-1", name: "Target", parentId: null, version: 1 }],
    documents: [{ id: "document-1", title: "Specification", documentType: "requirement", folderId: null, version: 2 }],
  });
  return render(
    <QueryClientProvider client={client}>
      <TreePanel workspaceId="workspace-1" selectedDocumentId={null} onSelectDocument={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("TreePanel drag and drop", () => {
  beforeEach(() => useDocumentTabsStore.getState().reset());

  it("moves a document onto a folder", async () => {
    renderTree();
    const transfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn(), getData: vi.fn() };
    fireEvent.dragStart(screen.getByTestId("tree-document-document-1"), { dataTransfer: transfer });
    expect(screen.getByTestId("tree-root-drop-target")).toBeInTheDocument();
    fireEvent.dragOver(screen.getByTestId("tree-folder-folder-1"), { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId("tree-folder-folder-1"), { dataTransfer: transfer });
    await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/documents/document-1", expect.objectContaining({ method: "PATCH" })));
    const request = vi.mocked(api).mock.calls.find(([path]) => path === "/documents/document-1");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ folderId: "folder-1", expectedVersion: 2 });
  });

  it("adds a document to personal favorites from its context menu", async () => {
    renderTree();
    fireEvent.contextMenu(screen.getByTestId("tree-document-document-1"), { clientX: 30, clientY: 40 });
    fireEvent.click(screen.getByTestId("menu-favorite"));
    await waitFor(() => expect(useDocumentTabsStore.getState().favoriteDocuments).toEqual([
      { id: "document-1", title: "Specification", documentType: "requirement" },
    ]));
  });
});
