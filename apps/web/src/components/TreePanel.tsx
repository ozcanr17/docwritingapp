import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Folder as FolderIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DocumentSummary, FolderSummary } from "../lib/api";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface TreePanelProps {
  workspaceId: string;
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
}

interface TreeChildren {
  folders: FolderSummary[];
  documents: DocumentSummary[];
}

interface MenuState {
  x: number;
  y: number;
  folderId: string | null;
  documentId?: string;
}

export function TreePanel({ workspaceId, selectedDocumentId, onSelectDocument }: TreePanelProps) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<MenuState | null>(null);

  const menuItems = (state: MenuState): MenuItem[] => {
    const items: MenuItem[] = [
      { key: "newFolder", label: t("newFolder"), onSelect: () => createNode(state.folderId, "folder") },
      { key: "newDocument", label: t("newDocument"), onSelect: () => createNode(state.folderId, "document") },
      { key: "newTextDocument", label: t("newTextDocument"), onSelect: () => createNode(state.folderId, "textDocument") },
    ];
    if (state.documentId) {
      items.push({
        key: "delete",
        label: t("deleteAction"),
        danger: true,
        onSelect: () => void deleteDocument(state.documentId as string),
      });
    }
    return items;
  };

  const queryClient = useQueryClient();
  const invalidateBranch = (parentId: string | null) =>
    queryClient.invalidateQueries({ queryKey: ["tree", workspaceId, parentId] });

  const createNode = (parentId: string | null, kind: "folder" | "document" | "textDocument") => {
    const promptLabel =
      kind === "folder" ? t("newFolder") : kind === "textDocument" ? t("newTextDocument") : t("newDocument");
    const name = window.prompt(promptLabel);
    if (!name) return;
    const request =
      kind === "folder"
        ? api(`/workspaces/${workspaceId}/folders`, {
            method: "POST",
            body: JSON.stringify({ name, parentId }),
          })
        : api(`/workspaces/${workspaceId}/documents`, {
            method: "POST",
            body: JSON.stringify({
              title: name,
              documentType: kind === "textDocument" ? "general_document" : "requirement",
              folderId: parentId,
            }),
          });
    void request.then(() => invalidateBranch(parentId));
  };

  const deleteDocument = async (documentId: string) => {
    await api(`/documents/${documentId}`, { method: "DELETE", body: JSON.stringify({}) });
    await queryClient.invalidateQueries({ queryKey: ["tree", workspaceId] });
  };

  return (
    <div
      className="h-full overflow-auto py-2 text-sm"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY, folderId: null });
      }}
    >
      <TreeBranch
        workspaceId={workspaceId}
        parentId={null}
        depth={0}
        selectedDocumentId={selectedDocumentId}
        onSelectDocument={onSelectDocument}
        onContextMenu={setMenu}
      />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}
    </div>
  );
}

function TreeBranch(props: {
  workspaceId: string;
  parentId: string | null;
  depth: number;
  selectedDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onContextMenu: (state: MenuState) => void;
}) {
  const { workspaceId, parentId, depth, selectedDocumentId, onSelectDocument, onContextMenu } = props;
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["tree", workspaceId, parentId],
    queryFn: () =>
      api<TreeChildren>(`/workspaces/${workspaceId}/tree${parentId ? `?parentId=${parentId}` : ""}`),
  });

  if (!data) return null;
  if (depth === 0 && data.folders.length === 0 && data.documents.length === 0) {
    return <div data-testid="tree-empty" className="px-3 py-2 text-mutedForeground">{t("emptyTree")}</div>;
  }

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ul role={depth === 0 ? "tree" : "group"}>
      {data.folders.map((folder) => (
        <li key={folder.id} role="treeitem" aria-expanded={expanded.has(folder.id)}>
          <button
            className="flex w-full items-center gap-1 px-2 py-1 hover:bg-muted"
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => toggle(folder.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu({ x: event.clientX, y: event.clientY, folderId: folder.id });
            }}
          >
            {expanded.has(folder.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <FolderIcon size={14} className="text-warning" />
            <span className="truncate">{folder.name}</span>
          </button>
          {expanded.has(folder.id) && (
            <TreeBranch
              workspaceId={workspaceId}
              parentId={folder.id}
              depth={depth + 1}
              selectedDocumentId={selectedDocumentId}
              onSelectDocument={onSelectDocument}
              onContextMenu={onContextMenu}
            />
          )}
        </li>
      ))}
      {data.documents.map((document) => (
        <li key={document.id} role="treeitem">
          <button
            className={`flex w-full items-center gap-1 px-2 py-1 hover:bg-muted ${
              selectedDocumentId === document.id ? "bg-selection" : ""
            }`}
            style={{ paddingLeft: 22 + depth * 14 }}
            onClick={() => onSelectDocument(document.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu({
                x: event.clientX,
                y: event.clientY,
                folderId: document.folderId,
                documentId: document.id,
              });
            }}
          >
            <FileText size={14} className="text-info" />
            <span className="truncate">{document.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
