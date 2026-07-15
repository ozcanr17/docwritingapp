import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Folder as FolderIcon } from "lucide-react";
import { FormEvent, useState } from "react";
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

type CreateKind = "folder" | "requirementDocument" | "testDocument" | "textDocument";

interface CreateState {
  folderId: string | null;
  kind: CreateKind;
}

export function TreePanel({ workspaceId, selectedDocumentId, onSelectDocument }: TreePanelProps) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [createState, setCreateState] = useState<CreateState | null>(null);
  const [createName, setCreateName] = useState("");

  const menuItems = (state: MenuState): MenuItem[] => {
    const items: MenuItem[] = [
      { key: "newFolder", label: t("newFolder"), onSelect: () => startCreate(state.folderId, "folder") },
      {
        key: "newDocument",
        label: t("newRequirementDocument"),
        onSelect: () => startCreate(state.folderId, "requirementDocument"),
      },
      {
        key: "newTestDocument",
        label: t("newTestDocument"),
        onSelect: () => startCreate(state.folderId, "testDocument"),
      },
      { key: "newTextDocument", label: t("newTextDocument"), onSelect: () => startCreate(state.folderId, "textDocument") },
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

  const startCreate = (folderId: string | null, kind: CreateKind) => {
    setCreateName("");
    setCreateState({ folderId, kind });
  };

  const createNode = async (event: FormEvent) => {
    event.preventDefault();
    if (!createState || !createName.trim()) return;
    const { folderId, kind } = createState;
    const name = createName.trim();
    const request =
      kind === "folder"
        ? api<{ id: string }>(`/workspaces/${workspaceId}/folders`, {
            method: "POST",
            body: JSON.stringify({ name, parentId: folderId }),
          })
        : api<{ id: string }>(`/workspaces/${workspaceId}/documents`, {
            method: "POST",
            body: JSON.stringify({
              title: name,
              documentType:
                kind === "textDocument" ? "general_document" : kind === "testDocument" ? "test" : "requirement",
              folderId,
            }),
          });
    const created = await request;
    await invalidateBranch(folderId);
    setCreateState(null);
    if (kind !== "folder") onSelectDocument(created.id);
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
      {createState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <form className="w-full max-w-md rounded border border-border bg-surfaceElevated p-4 shadow-lg" onSubmit={createNode}>
            <h2 className="mb-3 text-sm font-semibold">
              {createState.kind === "folder"
                ? t("newFolder")
                : createState.kind === "textDocument"
                  ? t("newTextDocument")
                  : createState.kind === "testDocument"
                    ? t("newTestDocument")
                    : t("newRequirementDocument")}
            </h2>
            <label className="block text-xs text-mutedForeground">
              {t("name")}
              <input
                autoFocus
                data-testid="tree-create-name"
                className="mt-1 w-full rounded border border-border bg-editorBackground px-2 py-1.5 text-sm text-foreground"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                data-testid="tree-create-cancel"
                className="rounded px-3 py-1.5 text-sm hover:bg-muted"
                onClick={() => setCreateState(null)}
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                data-testid="tree-create-submit"
                className="rounded bg-primary px-3 py-1.5 text-sm text-primaryForeground disabled:opacity-50"
                disabled={!createName.trim()}
              >
                {t("create")}
              </button>
            </div>
          </form>
        </div>
      )}
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
            className="mx-1 flex w-auto items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-muted"
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
            className={`mx-1 flex w-auto items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-muted ${
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
