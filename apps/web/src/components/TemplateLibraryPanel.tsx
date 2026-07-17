import { FilePlus2, Layers3, Save, Trash2, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentTemplateSummary, OutlineRow } from "../lib/api";

interface TemplateLibraryPanelProps {
  templates: DocumentTemplateSummary[];
  selectedRow: OutlineRow | null;
  pending: boolean;
  onSave: (name: string, sourceRowId: string | null) => void;
  onApply: (templateId: string, parentId: string | null) => void;
  onDelete: (templateId: string) => void;
  onClose: () => void;
}

export function TemplateLibraryPanel({ templates, selectedRow, pending, onSave, onApply, onDelete, onClose }: TemplateLibraryPanelProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"document" | "section">("section");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || (scope === "section" && !selectedRow)) return;
    onSave(name.trim(), scope === "section" ? selectedRow!.id : null);
    setName("");
  };
  return (
    <section data-testid="template-library" aria-label={t("templateLibrary")} className="border-b border-border bg-surface px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Layers3 size={16} />{t("templateLibrary")}</h2>
            <p className="mt-0.5 text-xs text-mutedForeground">{t("templateLibraryHelp")}</p>
          </div>
          <button aria-label={t("close")} className="rounded-lg p-1.5 hover:bg-muted" onClick={onClose}><X size={15} /></button>
        </div>
        <form className="grid gap-2 rounded-xl border border-border bg-editorBackground p-3 md:grid-cols-[1fr_12rem_auto]" onSubmit={submit}>
          <input data-testid="template-name" className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs" value={name} placeholder={t("templateName")} onChange={(event) => setName(event.target.value)} />
          <select className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs" value={scope} onChange={(event) => setScope(event.target.value as "document" | "section")}>
            <option value="section" disabled={!selectedRow}>{t("selectedSectionTemplate")}</option>
            <option value="document">{t("wholeDocumentTemplate")}</option>
          </select>
          <button className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primaryForeground disabled:opacity-50" disabled={!name.trim() || pending || (scope === "section" && !selectedRow)}><Save size={13} />{t("saveAsTemplate")}</button>
        </form>
        {templates.length === 0 ? <div className="rounded-xl border border-dashed border-border py-5 text-center text-xs text-mutedForeground">{t("noTemplates")}</div> : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <article key={template.id} className="flex items-center gap-3 rounded-xl border border-border bg-editorBackground p-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><FilePlus2 size={16} /></div>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{template.name}</div><div className="text-[10px] text-mutedForeground">{t(template.templateKind === "section" ? "sectionTemplate" : "documentTemplate")} · v{template.version}</div></div>
                <button className="rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50" disabled={pending} onClick={() => onApply(template.id, null)}>{t("applyAtRoot")}</button>
                {selectedRow && <button className="rounded-lg border border-primary/40 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 disabled:opacity-50" disabled={pending} onClick={() => onApply(template.id, selectedRow.id)}>{t("applyBelow")}</button>}
                <button aria-label={t("deleteAction")} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10" onClick={() => onDelete(template.id)}><Trash2 size={13} /></button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
