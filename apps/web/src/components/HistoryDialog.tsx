import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, DocumentHistoryEntry, RowDetail, RowHistoryEntry } from "../lib/api";
import { useToastStore } from "../stores/toasts";
import { RowHistoryPanel } from "./RowHistoryPanel";
import { useEscapeClose } from "../hooks/useEscapeClose";

export function HistoryDialog({ documentId, rowId, mode, onClose, onOpenRow }: { documentId: string; rowId: string | null; mode: "row" | "document"; onClose: () => void; onOpenRow: (rowId: string) => void }) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [query, setQuery] = useState("");
  const row = useQuery({ queryKey: ["row", rowId], queryFn: () => api<RowDetail>(`/rows/${rowId}`), enabled: mode === "row" && rowId !== null });
  const rowHistory = useQuery({ queryKey: ["row-history", rowId], queryFn: () => api<RowHistoryEntry[]>(`/rows/${rowId}/history`), enabled: mode === "row" && rowId !== null });
  const documentHistory = useQuery({ queryKey: ["document-history", documentId], queryFn: () => api<DocumentHistoryEntry[]>(`/documents/${documentId}/history`), enabled: mode === "document" });
  const visibleDocumentHistory = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (documentHistory.data ?? []).filter((entry) => !normalized || `${entry.action} ${entry.actor?.displayName ?? ""} ${entry.row?.objectNumber ?? ""} ${entry.row?.title ?? ""}`.toLocaleLowerCase().includes(normalized));
  }, [documentHistory.data, query]);
  const restore = useMutation({
    mutationFn: (entry: RowHistoryEntry) => api<RowDetail>(`/rows/${rowId}/history/${entry.eventId}/restore`, { method: "POST", body: JSON.stringify({ expectedVersion: row.data?.version, side: entry.side }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["row", rowId] });
      void queryClient.invalidateQueries({ queryKey: ["row-history", rowId] });
      void queryClient.invalidateQueries({ queryKey: ["document-history", documentId] });
      void queryClient.invalidateQueries({ queryKey: ["outline", documentId] });
      pushToast("success", t("rowVersionRestored"));
    },
    onError: (error) => pushToast("error", error instanceof ApiError && error.status === 409 ? t("conflictError") : t("genericError")),
  });

  return (
    <div data-testid="history-dialog" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-5" role="dialog" aria-modal="true" aria-label={t(mode === "row" ? "selectedRowHistory" : "documentHistory")}>
      <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3"><div className="flex items-center gap-2 font-semibold"><History size={17} />{t(mode === "row" ? "selectedRowHistory" : "documentHistory")}</div><button aria-label={t("closePanel")} className="rounded-lg p-1.5 text-mutedForeground hover:bg-muted" onClick={onClose}><X size={17} /></button></header>
        <div className="min-h-0 flex-1 overflow-auto p-5">
          {mode === "row" && (row.isLoading || rowHistory.isLoading) && <div className="text-sm text-mutedForeground">{t("loading")}</div>}
          {mode === "row" && (row.isError || rowHistory.isError) && <div className="text-sm text-destructive">{t("genericError")}</div>}
          {mode === "row" && row.data && rowHistory.data && <RowHistoryPanel row={row.data} entries={rowHistory.data} pending={restore.isPending} onRestore={(entry) => restore.mutate(entry)} />}
          {mode === "document" && <div className="space-y-3">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-editorBackground px-3 py-2"><Search size={14} /><span className="sr-only">{t("searchDocumentHistory")}</span><input data-testid="document-history-search" className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchDocumentHistory")} /></label>
            {documentHistory.isLoading && <div className="text-sm text-mutedForeground">{t("loading")}</div>}
            {documentHistory.isError && <div className="text-sm text-destructive">{t("genericError")}</div>}
            {documentHistory.data && visibleDocumentHistory.length === 0 && <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-mutedForeground">{t("noDocumentHistory")}</div>}
            <ol className="space-y-2">{visibleDocumentHistory.map((entry) => <li key={entry.id} className="flex items-start gap-3 rounded-xl border border-border bg-editorBackground p-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{t(`historyAction.${entry.action}`, { defaultValue: entry.action })}</span><span className="text-xs text-mutedForeground">{new Date(entry.createdAt).toLocaleString()}</span></div><div className="mt-1 text-xs text-mutedForeground">{entry.actor?.displayName ?? t("systemUser")}{entry.row ? ` · ID ${entry.row.objectNumber}` : ""}</div>{entry.row && <button className="mt-1 max-w-full truncate text-left text-xs text-primary hover:underline" onClick={() => onOpenRow(entry.row?.id ?? entry.entityId)}>{entry.row.title || t("untitled")}</button>}</div></li>)}</ol>
          </div>}
        </div>
      </div>
    </div>
  );
}
