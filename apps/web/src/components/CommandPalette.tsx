import { useQuery } from "@tanstack/react-query";
import { Command, FileText, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useEscapeClose } from "../hooks/useEscapeClose";

export interface PaletteCommand {
  id: string;
  label: string;
  category: string;
  shortcut: string;
  disabled?: boolean;
  run: () => void;
}

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

export function CommandPalette({ workspaceId, commands, onClose, onSelectResult }: {
  workspaceId: string;
  commands: PaletteCommand[];
  onClose: () => void;
  onSelectResult: (result: SearchResult) => void;
}) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const commandOnly = query.trimStart().startsWith(">");
  const normalized = query.trim().replace(/^>/, "").toLocaleLowerCase();
  const visibleCommands = useMemo(() => commands.filter((command) => !normalized || `${command.label} ${command.category}`.toLocaleLowerCase().includes(normalized)), [commands, normalized]);
  const searchable = !commandOnly && query.trim().length >= 2;
  const results = useQuery({
    queryKey: ["workspace-search", workspaceId, query],
    queryFn: () => api<SearchResult[]>(`/workspaces/${workspaceId}/search?q=${encodeURIComponent(query.trim())}`),
    enabled: searchable,
  });
  const items = [
    ...visibleCommands.map((command) => ({ key: `command-${command.id}`, disabled: command.disabled, run: command.run })),
    ...(results.data ?? []).map((result) => ({ key: `result-${result.id}`, disabled: false, run: () => onSelectResult(result) })),
  ];
  useEffect(() => setActiveIndex(0), [query, results.data?.length]);
  const runActive = () => {
    if (items.length === 0) return;
    for (let offset = 0; offset < items.length; offset += 1) {
      const item = items[(activeIndex + offset) % items.length];
      if (item && !item.disabled) {
        item.run();
        onClose();
        return;
      }
    }
  };
  return <div className="fixed inset-0 z-[210] flex justify-center bg-black/35 px-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
    <div data-testid="command-palette" role="dialog" aria-modal="true" aria-label={t("commandPalette")} className="flex max-h-[72vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surfaceElevated shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Command size={18} className="text-primary" />
        <input
          autoFocus
          data-testid="command-palette-input"
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
          value={query}
          placeholder={t("commandPalettePlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => items.length ? (current + 1) % items.length : 0);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => items.length ? (current - 1 + items.length) % items.length : 0);
            }
            if (event.key === "Enter") {
              event.preventDefault();
              runActive();
            }
          }}
        />
        <button type="button" aria-label={t("close")} className="rounded-lg p-1.5 hover:bg-muted" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {visibleCommands.length > 0 && <section>
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-mutedForeground">{t("commands")}</div>
          {visibleCommands.map((command, index) => <button
            key={command.id}
            type="button"
            data-testid={`palette-command-${command.id}`}
            disabled={command.disabled}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left disabled:opacity-35 ${activeIndex === index ? "bg-selection" : "hover:bg-muted"}`}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => { command.run(); onClose(); }}
          >
            <Command size={15} className="shrink-0 text-primary" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{command.label}</span><span className="block text-[11px] text-mutedForeground">{command.category}</span></span>
            {command.shortcut && <kbd className="shrink-0 rounded border border-border bg-editorBackground px-2 py-1 text-[10px] text-mutedForeground">{command.shortcut}</kbd>}
          </button>)}
        </section>}
        {!commandOnly && searchable && <section className={visibleCommands.length ? "mt-2 border-t border-border pt-2" : ""}>
          <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-mutedForeground"><Search size={12} />{t("documentsAndObjects")}</div>
          {results.isFetching && <div className="p-4 text-center text-sm text-mutedForeground">{t("loading")}</div>}
          {results.data?.map((result, resultIndex) => {
            const index = visibleCommands.length + resultIndex;
            return <button key={result.id} type="button" data-testid={`palette-result-${result.id}`} className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${activeIndex === index ? "bg-selection" : "hover:bg-muted"}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => { onSelectResult(result); onClose(); }}>
              <FileText size={15} className="mt-0.5 shrink-0 text-info" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{result.rowId ? [result.requirementNo, result.objectNumber ? `ID ${result.objectNumber}` : null, result.title].filter(Boolean).join(" · ") : result.document.title}</span><span className="block truncate text-[11px] text-mutedForeground">{result.document.title}</span>{result.description && <span className="mt-0.5 block line-clamp-1 text-xs text-mutedForeground">{result.description}</span>}</span>
            </button>;
          })}
          {!results.isFetching && results.data?.length === 0 && <div className="p-4 text-center text-sm text-mutedForeground">{t("noSearchResults")}</div>}
        </section>}
        {items.length === 0 && !results.isFetching && <div className="p-8 text-center text-sm text-mutedForeground">{t("noCommandsFound")}</div>}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border px-4 py-2 text-[10px] text-mutedForeground"><span>{t("paletteNavigateHelp")}</span><span>{t("paletteCommandOnlyHelp")}</span></div>
    </div>
  </div>;
}
