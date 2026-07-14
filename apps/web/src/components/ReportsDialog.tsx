import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useToastStore } from "../stores/toasts";

interface ReportsDialogProps {
  documentId: string;
  tab: "baselines" | "coverage" | "matrix";
  onClose: () => void;
}

interface MatrixRow {
  id: string;
  title: string;
  links: { linkId: string; suspect: boolean; linkType: string; sourceId: string; sourceTitle: string; sourceType: string }[];
}

interface Baseline {
  id: string;
  revisionNumber: number;
  label: string;
  createdAt: string;
  rowCount: number;
}

interface Diff {
  added: { id: string; title: string }[];
  removed: { id: string; title: string }[];
  modified: { id: string; before: string; after: string }[];
  summary: { added: number; removed: number; modified: number };
}

interface Coverage {
  totalRequirements: number;
  covered: number;
  uncovered: number;
  suspect: number;
  uncoveredRows: { id: string; title: string }[];
}

export function ReportsDialog({ documentId, tab, onClose }: ReportsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [diffRevision, setDiffRevision] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const baselines = useQuery({
    queryKey: ["baselines", documentId],
    queryFn: () => api<Baseline[]>(`/documents/${documentId}/baselines`),
    enabled: tab === "baselines",
  });

  const coverage = useQuery({
    queryKey: ["coverage", documentId],
    queryFn: () => api<Coverage>(`/documents/${documentId}/coverage`),
    enabled: tab === "coverage",
  });

  const diff = useQuery({
    queryKey: ["diff", documentId, diffRevision],
    queryFn: () => api<Diff>(`/documents/${documentId}/baselines/${diffRevision}/diff`),
    enabled: diffRevision !== null,
  });

  const matrix = useQuery({
    queryKey: ["matrix", documentId],
    queryFn: () => api<MatrixRow[]>(`/documents/${documentId}/traceability`),
    enabled: tab === "matrix",
  });

  const createBaseline = useMutation({
    mutationFn: (label: string) => api(`/documents/${documentId}/baselines`, { method: "POST", body: JSON.stringify({ label }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["baselines", documentId] });
      pushToast("success", t("createBaseline"));
    },
    onError: () => pushToast("error", t("genericError")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        data-testid="reports-dialog"
        className="max-h-[80vh] w-[36rem] overflow-auto rounded border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {tab === "baselines" ? t("baselines") : tab === "coverage" ? t("coverageReport") : t("traceabilityMatrix")}
          </h2>
          <button aria-label={t("close")} onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X size={16} />
          </button>
        </div>

        {tab === "baselines" && (
          <div className="space-y-3 text-sm">
            <button
              data-testid="create-baseline"
              className="rounded bg-primary px-3 py-1.5 text-xs text-primaryForeground"
              onClick={() => {
                const label = window.prompt(t("baselineLabel"));
                if (label) createBaseline.mutate(label);
              }}
            >
              {t("createBaseline")}
            </button>
            {baselines.data && baselines.data.length === 0 ? (
              <div className="text-mutedForeground">{t("noBaselines")}</div>
            ) : (
              <ul className="divide-y divide-border">
                {baselines.data?.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2">
                    <span>
                      <span className="tabular-nums text-mutedForeground">#{b.revisionNumber}</span> {b.label}
                      <span className="ml-2 text-xs text-mutedForeground">({b.rowCount})</span>
                    </span>
                    <button
                      data-testid={`diff-baseline-${b.revisionNumber}`}
                      className="text-xs text-primary hover:underline"
                      onClick={() => setDiffRevision(b.revisionNumber)}
                    >
                      {t("diff")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {diff.data && (
              <div data-testid="diff-result" className="rounded border border-border p-3 text-xs">
                <div className="mb-2 flex gap-4">
                  <span className="text-success">+ {diff.data.summary.added} {t("added")}</span>
                  <span className="text-destructive">− {diff.data.summary.removed} {t("removed")}</span>
                  <span className="text-warning">~ {diff.data.summary.modified} {t("modified")}</span>
                </div>
                {diff.data.modified.map((m) => (
                  <div key={m.id} className="text-mutedForeground">
                    <span className="line-through">{m.before}</span> → <span className="text-foreground">{m.after}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "coverage" && coverage.data && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <Stat label={t("totalRequirements")} value={coverage.data.totalRequirements} />
              <Stat label={t("covered")} value={coverage.data.covered} tone="text-success" />
              <Stat label={t("uncovered")} value={coverage.data.uncovered} tone="text-destructive" />
            </div>
            {coverage.data.uncoveredRows.length > 0 && (
              <ul className="divide-y divide-border" data-testid="uncovered-list">
                {coverage.data.uncoveredRows.map((r) => (
                  <li key={r.id} className="py-1.5 text-mutedForeground">
                    {r.title || "—"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "matrix" && matrix.data && (
          <div data-testid="matrix-table" className="text-sm">
            {matrix.data.length === 0 ? (
              <div className="text-mutedForeground">{t("noRequirements")}</div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-mutedForeground">
                    <th className="py-2 pr-3">{t("requirement")}</th>
                    <th className="py-2">{t("linkedItems")}</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.data.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top">
                      <td className="py-2 pr-3 font-medium">{r.title || "—"}</td>
                      <td className="py-2">
                        {r.links.length === 0 ? (
                          <span className="text-destructive">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {r.links.map((link) => (
                              <li key={link.linkId} className="flex items-center gap-1.5">
                                <span className="truncate">{link.sourceTitle || link.sourceId.slice(0, 8)}</span>
                                {link.suspect && (
                                  <span className="rounded bg-warning/20 px-1 text-[10px] uppercase text-warning">
                                    {t("suspect")}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded border border-border p-3 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
      <div className="mt-1 text-xs text-mutedForeground">{label}</div>
    </div>
  );
}
