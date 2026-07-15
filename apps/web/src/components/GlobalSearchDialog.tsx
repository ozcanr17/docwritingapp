import { useQuery } from "@tanstack/react-query";
import { FileText, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

interface SearchResult {
  id: string;
  rowType: string;
  title: string;
  description: string | null;
  requirementNo: string | null;
  document: { id: string; title: string; documentType: string };
}

export function GlobalSearchDialog({ workspaceId, onClose, onSelect }: { workspaceId: string; onClose: () => void; onSelect: (document: SearchResult["document"], rowId: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const results = useQuery({
    queryKey: ["workspace-search", workspaceId, query],
    queryFn: () => api<SearchResult[]>(`/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[200] flex justify-center bg-black/40 pt-[12vh]" onClick={onClose}>
      <div className="h-fit max-h-[70vh] w-[42rem] overflow-hidden rounded-2xl border border-border bg-surfaceElevated shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search size={18} className="text-mutedForeground" />
          <input autoFocus className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={t("advancedSearch")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <button aria-label={t("close")} onClick={onClose}><X size={16} /></button>
        </div>
        <div className="max-h-[58vh] overflow-auto p-2">
          {results.data?.map((result) => (
            <button key={result.id} className="flex w-full gap-3 rounded-xl p-3 text-left hover:bg-muted" onClick={() => onSelect(result.document, result.id)}>
              <FileText size={16} className="mt-0.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{[result.requirementNo, result.title].filter(Boolean).join(" : ") || "-"}</span>
                <span className="block truncate text-xs text-mutedForeground">{result.document.title} · {result.rowType}</span>
                {result.description && <span className="mt-1 block line-clamp-2 text-xs text-mutedForeground">{result.description}</span>}
              </span>
            </button>
          ))}
          {query.trim().length >= 2 && results.data?.length === 0 && <div className="p-6 text-center text-sm text-mutedForeground">{t("noSearchResults")}</div>}
          {query.trim().length < 2 && <div className="p-6 text-center text-sm text-mutedForeground">{t("searchHint")}</div>}
        </div>
      </div>
    </div>
  );
}
