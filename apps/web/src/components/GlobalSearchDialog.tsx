import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface SearchResult {
  id: string;
  rowId: string | null;
  rowType: string;
  title: string;
  description: string | null;
  requirementNo: string | null;
  objectNumber: number | null;
  document: { id: string; title: string; documentType: string };
}

interface GlobalSearchDialogProps {
  workspaceId: string;
  query: string;
  onClose: () => void;
  onSelect: (document: SearchResult["document"], rowId: string | null) => void;
}

export function GlobalSearchDialog({ workspaceId, query, onClose, onSelect }: GlobalSearchDialogProps) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number } | null>(null);
  const searchable = query.trim().length >= 2 || /^\d+$/.test(query.trim());
  const results = useQuery({
    queryKey: ["workspace-search", workspaceId, query],
    queryFn: () => api<SearchResult[]>(`/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`),
    enabled: searchable,
  });
  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      const search = document.getElementById("docsys-global-search");
      if (!panelRef.current?.contains(target) && !search?.contains(target)) onClose();
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
    };
  }, [onClose]);
  useLayoutEffect(() => {
    const search = document.getElementById("docsys-global-search");
    if (!search) return;
    const update = () => {
      const rect = search.getBoundingClientRect();
      setBounds({ left: rect.left, top: rect.bottom - 1, width: rect.width });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(search);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div
      ref={panelRef}
      data-testid="global-search-results"
      style={bounds ?? { visibility: "hidden" }}
      className="fixed z-[190] max-h-[min(32rem,70vh)] overflow-auto rounded-b-xl border border-t-0 border-border bg-surfaceElevated p-2 shadow-2xl"
    >
      {results.isFetching && <div className="p-5 text-center text-sm text-mutedForeground">{t("loading")}</div>}
      {!results.isFetching && results.data?.map((result) => (
        <button key={result.id} className="flex w-full gap-3 rounded-lg p-3 text-left hover:bg-muted" onClick={() => onSelect(result.document, result.rowId)}>
          <FileText size={16} className="mt-0.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {result.rowId === null
                ? result.document.title
                : [result.requirementNo, result.objectNumber ? `ID ${result.objectNumber}` : null, result.title].filter(Boolean).join(" · ") || "-"}
            </span>
            <span className="block truncate text-xs text-mutedForeground">{result.document.title} · {result.rowId === null ? t("document") : result.rowType}</span>
            {result.description && <span className="mt-1 block line-clamp-2 text-xs text-mutedForeground">{result.description}</span>}
          </span>
        </button>
      ))}
      {!results.isFetching && searchable && results.data?.length === 0 && <div className="p-6 text-center text-sm text-mutedForeground">{t("noSearchResults")}</div>}
      {!searchable && <div className="flex items-center justify-center gap-2 p-6 text-center text-sm text-mutedForeground"><Search size={15} />{t("searchHint")}</div>}
    </div>
  );
}
