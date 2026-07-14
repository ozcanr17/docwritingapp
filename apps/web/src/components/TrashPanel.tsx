import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Folder as FolderIcon, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useToastStore } from "../stores/toasts";

interface TrashContents {
  folders: { id: string; name: string; deletedAt: string }[];
  documents: { id: string; title: string; deletedAt: string }[];
}

export function TrashPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const { data } = useQuery({
    queryKey: ["trash", workspaceId],
    queryFn: () => api<TrashContents>(`/workspaces/${workspaceId}/trash`),
  });

  const restore = useMutation({
    mutationFn: (input: { kind: "folder" | "document"; id: string }) =>
      api(`/${input.kind === "folder" ? "folders" : "documents"}/${input.id}/restore`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trash", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["tree", workspaceId] });
      pushToast("success", t("restore"));
    },
    onError: () => pushToast("error", t("genericError")),
  });

  const isEmpty = data && data.folders.length === 0 && data.documents.length === 0;

  return (
    <div className="h-full overflow-auto p-4" data-testid="trash-panel">
      <h2 className="mb-3 text-sm font-semibold">{t("trash")}</h2>
      {isEmpty ? (
        <div data-testid="trash-empty" className="text-sm text-mutedForeground">
          {t("emptyTrash")}
        </div>
      ) : (
        <ul className="space-y-1 text-sm">
          {data?.folders.map((folder) => (
            <li key={folder.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <FolderIcon size={14} className="text-warning" />
              <span className="flex-1 truncate">{folder.name}</span>
              <span className="text-xs tabular-nums text-mutedForeground">
                {new Date(folder.deletedAt).toLocaleDateString()}
              </span>
              <button
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                onClick={() => restore.mutate({ kind: "folder", id: folder.id })}
              >
                <RotateCcw size={12} />
                {t("restore")}
              </button>
            </li>
          ))}
          {data?.documents.map((document) => (
            <li key={document.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
              <FileText size={14} className="text-info" />
              <span className="flex-1 truncate">{document.title}</span>
              <span className="text-xs tabular-nums text-mutedForeground">
                {new Date(document.deletedAt).toLocaleDateString()}
              </span>
              <button
                data-testid="restore-document"
                className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                onClick={() => restore.mutate({ kind: "document", id: document.id })}
              >
                <RotateCcw size={12} />
                {t("restore")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
