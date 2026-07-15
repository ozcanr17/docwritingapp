import { Columns2, ExternalLink, FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DocumentTab } from "../stores/documentTabs";

export function DocumentTabsBar({
  tabs,
  activeId,
  secondaryId,
  onActivate,
  onClose,
  onSecondaryChange,
  onOpenWindow,
}: {
  tabs: DocumentTab[];
  activeId: string | null;
  secondaryId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSecondaryChange: (id: string | null) => void;
  onOpenWindow: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-11 items-center gap-2 border-b border-border bg-surface/90 px-2 backdrop-blur-xl">
      <div role="tablist" aria-label={t("openDocuments")} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1.5">
        {tabs.map((tab) => (
          <div key={tab.id} className={`group flex h-8 shrink-0 items-center rounded-lg border transition-colors ${tab.id === activeId ? "border-border bg-editorBackground shadow-sm" : "border-transparent text-mutedForeground hover:bg-muted"}`}>
            <button role="tab" aria-selected={tab.id === activeId} data-testid={`document-tab-${tab.id}`} className="flex max-w-56 min-w-0 items-center gap-2 px-2.5 py-1.5 text-xs" onClick={() => onActivate(tab.id)}>
              <FileText size={13} className={tab.documentType === "test" ? "text-warning" : tab.documentType === "requirement" ? "text-info" : "text-mutedForeground"} />
              <span className="truncate">{tab.title}</span>
            </button>
            <button data-testid={`close-document-tab-${tab.id}`} aria-label={t("closeDocument", { title: tab.title })} className="mr-1 rounded p-1 opacity-60 hover:bg-muted hover:opacity-100" onClick={() => onClose(tab.id)}><X size={12} /></button>
          </div>
        ))}
      </div>
      {activeId && (
        <div className="flex shrink-0 items-center gap-1 border-l border-border pl-2">
          <label className="flex items-center gap-1.5 rounded-lg border border-border bg-editorBackground px-2 py-1 text-xs text-mutedForeground">
            <Columns2 size={13} />
            <span className="hidden xl:inline">{t("splitView")}</span>
            <select data-testid="split-document-select" aria-label={t("splitView")} className="max-w-40 bg-transparent text-foreground outline-none" value={secondaryId ?? ""} onChange={(event) => onSecondaryChange(event.target.value || null)}>
              <option value="">{t("splitOff")}</option>
              {tabs.filter((tab) => tab.id !== activeId).map((tab) => <option key={tab.id} value={tab.id}>{tab.title}</option>)}
            </select>
          </label>
          <button aria-label={t("openInNewWindow")} title={t("openInNewWindow")} className="rounded-lg border border-border p-2 text-mutedForeground hover:bg-muted hover:text-foreground" onClick={() => onOpenWindow(activeId)}><ExternalLink size={14} /></button>
        </div>
      )}
    </div>
  );
}
