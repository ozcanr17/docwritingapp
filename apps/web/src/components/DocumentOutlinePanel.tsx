import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OutlineRow } from "../lib/api";

export function DocumentOutlinePanel({
  rows,
  selectedRowId,
  onSelect,
  onClose,
}: {
  rows: OutlineRow[];
  selectedRowId: string | null;
  onSelect: (row: OutlineRow) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sections = rows.filter((row) => row.rowType === "heading" || row.rowType === "test_case");
  return (
    <nav
      data-testid="document-outline"
      aria-label={t("moduleOutline")}
      className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-border bg-surfaceSubtle"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border/70 py-1.5 pl-3 pr-1.5">
        <span className="section-label">{t("moduleOutline")}</span>
        <button
          type="button"
          data-testid="close-outline"
          aria-label={t("close")}
          title={t("close")}
          className="flex h-6 w-6 items-center justify-center rounded text-mutedForeground hover:bg-muted hover:text-foreground"
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {sections.length === 0 ? (
          <p className="px-3 py-2 text-xs leading-5 text-mutedForeground">{t("moduleOutlineEmpty")}</p>
        ) : (
          sections.map((row) => (
            <button
              key={row.id}
              type="button"
              data-testid={`outline-row-${row.displayNumber}`}
              aria-current={selectedRowId === row.id ? "true" : undefined}
              className={`flex w-full items-baseline gap-1.5 py-1 pr-2 text-left text-xs leading-5 transition-colors ${
                selectedRowId === row.id ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground"
              }`}
              style={{ paddingLeft: 12 + row.depth * 12 }}
              onClick={() => onSelect(row)}
            >
              <span className="shrink-0 tabular-nums text-mutedForeground">{row.displayNumber}</span>
              <span className="min-w-0 flex-1 truncate">{row.title || t("untitledSection")}</span>
            </button>
          ))
        )}
      </div>
    </nav>
  );
}
