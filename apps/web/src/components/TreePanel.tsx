import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Folder as FolderIcon } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DocumentSummary, FolderSummary } from "../lib/api";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface TreePanelProps {
  workspaceId: string;
  selectedDocumentId: string | null;
  onSelectDocument: (document: DocumentSummary) => void;
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
  version?: number;
}

interface MoveState {
  kind: "folder" | "document";
  id: string;
  version: number;
  currentFolderId: string | null;
}

interface DeleteState {
  kind: "folder" | "document";
  id: string;
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
  const [moveState, setMoveState] = useState<MoveState | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const { data: folders = [] } = useQuery({
    queryKey: ["folders", workspaceId],
    queryFn: () => api<Array<FolderSummary & { ancestorPath: string; depth: number }>>(`/workspaces/${workspaceId}/folders`),
  });

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
        key: "move",
        label: t("moveAction"),
        onSelect: () => startMove("document", state.documentId as string, state.version as number, state.folderId),
      });
      items.push({
        key: "delete",
        label: t("deleteAction"),
        danger: true,
        onSelect: () => setDeleteState({ kind: "document", id: state.documentId as string }),
      });
    } else if (state.folderId) {
      items.push({
        key: "move",
        label: t("moveAction"),
        onSelect: () => startMove("folder", state.folderId as string, state.version as number, state.folderId),
      });
      items.push({
        key: "delete",
        label: t("deleteAction"),
        danger: true,
        onSelect: () => setDeleteState({ kind: "folder", id: state.folderId as string }),
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

  const startMove = (kind: MoveState["kind"], id: string, version: number, currentFolderId: string | null) => {
    setMoveTarget(kind === "folder" ? "" : currentFolderId ?? "");
    setMoveState({ kind, id, version, currentFolderId });
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
        : api<DocumentSummary>(`/workspaces/${workspaceId}/documents`, {
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
    if (kind !== "folder") onSelectDocument(created as DocumentSummary);
  };

  const deleteDocument = async (documentId: string) => {
    await api(`/documents/${documentId}`, { method: "DELETE", body: JSON.stringify({}) });
    await queryClient.invalidateQueries({ queryKey: ["tree", workspaceId] });
  };

  const confirmDelete = async () => {
    if (!deleteState) return;
    if (deleteState.kind === "folder") {
      await api(`/folders/${deleteState.id}`, { method: "DELETE", body: JSON.stringify({}) });
    } else {
      await deleteDocument(deleteState.id);
    }
    setDeleteState(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tree", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] }),
    ]);
  };

  const moveNode = async (event: FormEvent) => {
    event.preventDefault();
    if (!moveState) return;
    const target = moveTarget || null;
    if (moveState.kind === "folder") {
      await api(`/folders/${moveState.id}/move`, {
        method: "POST",
        body: JSON.stringify({ newParentId: target, expectedVersion: moveState.version }),
      });
    } else {
      await api(`/documents/${moveState.id}`, {
        method: "PATCH",
        body: JSON.stringify({ folderId: target, expectedVersion: moveState.version }),
      });
    }
    setMoveState(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tree", workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ["folders", workspaceId] }),
    ]);
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
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
      {moveState && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <form className="w-full max-w-md rounded-xl border border-border bg-surfaceElevated p-4 shadow-xl" onSubmit={moveNode}>
            <h2 className="mb-3 text-sm font-semibold">{t("moveToFolder")}</h2>
            <label className="block text-xs text-mutedForeground">
              {t("folder")}
              <select autoFocus className="mt-1 w-full rounded border border-border bg-editorBackground px-2 py-2 text-sm text-foreground" value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>
                <option value="">{t("rootFolder")}</option>
                {folders.filter((folder) => moveState.kind !== "folder" || (folder.id !== moveState.id && !folder.ancestorPath.includes(`${moveState.id}/`))).map((folder) => (
                  <option key={folder.id} value={folder.id}>{`${"  ".repeat(folder.depth)}${folder.name}`}</option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setMoveState(null)}>{t("cancel")}</button>
              <button type="submit" className="rounded bg-primary px-3 py-1.5 text-sm text-primaryForeground">{t("moveAction")}</button>
            </div>
          </form>
        </div>
      )}
      {deleteState && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-border bg-surfaceElevated p-4 shadow-xl">
            <h2 className="text-sm font-semibold">{deleteState.kind === "folder" ? t("deleteFolderTitle") : t("deleteDocumentTitle")}</h2>
            <p className="mt-2 text-sm text-mutedForeground">{deleteState.kind === "folder" ? t("deleteFolderMessage") : t("deleteDocumentMessage")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setDeleteState(null)}>{t("cancel")}</button>
              <button type="button" className="rounded bg-danger px-3 py-1.5 text-sm text-white" onClick={() => void confirmDelete()}>{t("deleteAction")}</button>
            </div>
          </div>
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
  onSelectDocument: (document: DocumentSummary) => void;
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
              onContextMenu({ x: event.clientX, y: event.clientY, folderId: folder.id, version: folder.version });
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
            onClick={() => onSelectDocument(document)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu({
                x: event.clientX,
                y: event.clientY,
                folderId: document.folderId,
                documentId: document.id,
                version: document.version,
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
