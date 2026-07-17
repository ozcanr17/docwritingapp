import { FileText, Pin, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentTab } from "../stores/documentTabs";
import { ContextMenu } from "./ContextMenu";

export function DocumentTabsBar({
  tabs,
  activeId,
  primaryId,
  secondaryId,
  onActivate,
  onClose,
  onSecondaryChange,
  onOpenWindow,
  onTogglePin,
  onReorder,
  splitDirection,
  onSplitDirectionChange,
}: {
  tabs: DocumentTab[];
  activeId: string | null;
  primaryId: string | null;
  secondaryId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onSecondaryChange: (id: string | null) => void;
  onOpenWindow: (id: string) => void;
  onTogglePin: (id: string) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  splitDirection: "horizontal" | "vertical";
  onSplitDirectionChange: (direction: "horizontal" | "vertical") => void;
}) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<{ x: number; y: number; tab: DocumentTab } | null>(null);
  const openMenu = (tab: DocumentTab, x: number, y: number) => setMenu({ x, y, tab });
  return (
    <div className="relative z-30 flex min-h-12 items-center border-b border-border bg-surface/90 px-2 backdrop-blur-xl">
      <div role="tablist" aria-label={t("openDocuments")} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1.5">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            draggable
            className={`group flex h-9 min-w-32 max-w-64 flex-[1_1_12rem] items-center rounded-lg border transition-colors ${tab.id === activeId ? "border-border bg-editorBackground shadow-sm" : "border-transparent text-mutedForeground hover:bg-muted"}`}
            onContextMenu={(event) => {
              event.preventDefault();
              onActivate(tab.id);
              openMenu(tab, event.clientX, event.clientY);
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-docsys-tab", tab.id);
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("application/x-docsys-tab")) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData("application/x-docsys-tab");
              if (sourceId) onReorder(sourceId, tab.id);
            }}
          >
            <button
              role="tab"
              aria-selected={tab.id === activeId}
              data-testid={`document-tab-${tab.id}`}
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-xs"
              onClick={() => onActivate(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  openMenu(tab, bounds.left + 12, bounds.bottom + 4);
                }
              }}
            >
              <FileText size={13} className={tab.documentType === "test" ? "text-warning" : tab.documentType === "requirement" ? "text-info" : "text-mutedForeground"} />
              {tab.pinned && <Pin size={11} className="text-primary" />}
              <span className="truncate">{tab.title}</span>
            </button>
            {!tab.pinned && <button data-testid={`close-document-tab-${tab.id}`} aria-label={t("closeDocument", { title: tab.title })} className="mr-1.5 rounded p-1 opacity-50 hover:bg-muted hover:opacity-100" onClick={(event) => { event.stopPropagation(); onClose(tab.id); }}><X size={12} /></button>}
          </div>
        ))}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              key: "split",
              label: t("openInSplitView"),
              disabled: tabs.length < 2,
              onSelect: () => {
                if (menu.tab.id !== primaryId) onSecondaryChange(menu.tab.id);
                else onSecondaryChange(tabs.find((tab) => tab.id !== primaryId)?.id ?? null);
              },
            },
            { key: "pin", label: t(menu.tab.pinned ? "unpinDocument" : "pinDocument"), onSelect: () => onTogglePin(menu.tab.id) },
            ...(secondaryId ? [
              { key: "split-horizontal", label: t("splitSideBySide"), disabled: splitDirection === "horizontal", onSelect: () => onSplitDirectionChange("horizontal") },
              { key: "split-vertical", label: t("splitStacked"), disabled: splitDirection === "vertical", onSelect: () => onSplitDirectionChange("vertical") },
              { key: "splitOff", label: t("splitOff"), onSelect: () => onSecondaryChange(null) },
            ] : []),
            { key: "window", label: t("openInNewWindow"), onSelect: () => onOpenWindow(menu.tab.id) },
            { key: "close", label: t("close"), onSelect: () => onClose(menu.tab.id) },
          ]}
        />
      )}
    </div>
  );
}
