import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileSearch, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { api, RowType } from "../lib/api";

type ImportFormat = "csv" | "xlsx" | "reqif";

interface ImportFinding {
  severity: "error" | "warning";
  code: string;
  row: number | null;
  value?: string;
}

interface ImportPreview {
  valid: boolean;
  rowCount: number;
  counts: Record<RowType, number>;
  findings: ImportFinding[];
  sample: Array<{ sourceRow: number; level: number; rowType: RowType; title: string; requirementNo: string; action: string }>;
}

function pathFor(documentId: string, format: ImportFormat, preview: boolean) {
  const suffix = format === "csv" ? "" : `/${format}`;
  return `/documents/${documentId}/imports${suffix}${preview ? "/preview" : ""}`;
}

function bodyFor(format: ImportFormat, content: string) {
  return JSON.stringify(format === "csv" ? { csv: content } : format === "xlsx" ? { data: content } : { reqif: content });
}

export function MigrationWizard({ documentId, format, fileName, content, onClose, onImported }: { documentId: string; format: ImportFormat; fileName: string; content: string; onClose: () => void; onImported: () => Promise<void> }) {
  const { t } = useTranslation();
  useEscapeClose(onClose, true);
  const preview = useQuery({
    queryKey: ["import-preview", documentId, format, fileName, content.length],
    queryFn: () => api<ImportPreview>(pathFor(documentId, format, true), { method: "POST", body: bodyFor(format, content) }),
    retry: false,
  });
  const importFile = useMutation({
    mutationFn: () => api(pathFor(documentId, format, false), { method: "POST", body: bodyFor(format, content) }),
    onSuccess: async () => { window.dispatchEvent(new CustomEvent("docsys:pilot-event", { detail: { eventName: "import_completed", metadata: { format, rowCount: preview.data?.rowCount ?? 0 } } })); await onImported(); onClose(); },
  });
  useEffect(() => {
    if (preview.data) window.dispatchEvent(new CustomEvent("docsys:pilot-event", { detail: { eventName: "import_previewed", metadata: { format, rowCount: preview.data.rowCount, valid: preview.data.valid } } }));
  }, [format, preview.data]);
  const counts = preview.data ? Object.entries(preview.data.counts).filter(([, count]) => count > 0) : [];
  return <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="migration-wizard-title">
    <section data-testid="migration-wizard" className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surfaceElevated shadow-2xl">
      <header className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><FileSearch size={20} /></span><div><h2 id="migration-wizard-title" className="font-semibold">{t("migrationWizardTitle")}</h2><p className="text-xs text-mutedForeground">{fileName} - {format.toUpperCase()}</p></div></div><button aria-label={t("close")} className="rounded-lg p-2 hover:bg-muted" onClick={onClose}><X size={17} /></button></header>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {preview.isLoading && <p className="text-sm text-mutedForeground">{t("analyzingImport")}</p>}
        {preview.isError && <div data-testid="migration-preview-error" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{t("importPreviewFailed")}</div>}
        {preview.data && <div className="space-y-5">
          <div data-testid={preview.data.valid ? "migration-preview-valid" : "migration-preview-invalid"} className={`flex items-start gap-3 rounded-xl border p-4 ${preview.data.valid ? "border-success/35 bg-success/10" : "border-destructive/35 bg-destructive/10"}`}><span className={preview.data.valid ? "text-success" : "text-destructive"}>{preview.data.valid ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}</span><div><div className="text-sm font-semibold">{t(preview.data.valid ? "importReady" : "importNotReady")}</div><div className="mt-1 text-xs text-mutedForeground">{t("importRowsDetected", { count: preview.data.rowCount })}</div></div></div>
          <div className="flex flex-wrap gap-2">{counts.map(([type, count]) => <span key={type} className="rounded-full border border-border bg-editorBackground px-3 py-1 text-xs">{t(`rowTypeLabel.${type}`)}: {count}</span>)}</div>
          {preview.data.findings.length > 0 && <section><h3 className="mb-2 text-sm font-semibold">{t("validationFindings")}</h3><div className="space-y-2">{preview.data.findings.map((finding, index) => <div key={`${finding.code}-${finding.row}-${index}`} data-testid={`import-finding-${finding.severity}`} className={`flex gap-3 rounded-lg border px-3 py-2 text-sm ${finding.severity === "error" ? "border-destructive/30 text-destructive" : "border-warning/30 text-warning"}`}><span className="font-medium">{finding.row ? t("sourceRow", { row: finding.row }) : t("fileLevel")}</span><span>{t(`importFinding.${finding.code}`)}{finding.value ? `: ${finding.value}` : ""}</span></div>)}</div></section>}
          <section><h3 className="mb-2 text-sm font-semibold">{t("importSample")}</h3><div className="overflow-hidden rounded-xl border border-border"><table className="w-full text-left text-xs"><thead className="bg-muted text-mutedForeground"><tr><th className="px-3 py-2">{t("source")}</th><th className="px-3 py-2">{t("type")}</th><th className="px-3 py-2">{t("content")}</th></tr></thead><tbody>{preview.data.sample.map((row) => <tr key={row.sourceRow} className="border-t border-border"><td className="px-3 py-2">{row.sourceRow}</td><td className="px-3 py-2">{t(`rowTypeLabel.${row.rowType}`)}</td><td className="max-w-xl truncate px-3 py-2">{row.requirementNo || row.title || row.action || "-"}</td></tr>)}</tbody></table></div></section>
        </div>}
      </div>
      <footer className="flex items-center justify-between border-t border-border px-5 py-4"><p className="text-xs text-mutedForeground">{t("importNoChangesUntilConfirm")}</p><div className="flex gap-2"><button className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("cancel")}</button><button data-testid="confirm-migration-import" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primaryForeground disabled:opacity-40" disabled={!preview.data?.valid || importFile.isPending} onClick={() => importFile.mutate()}>{importFile.isPending ? t("importing") : t("confirmImport")}</button></div></footer>
      {importFile.isError && <div className="border-t border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-destructive">{t("operationFailed")}</div>}
    </section>
  </div>;
}
