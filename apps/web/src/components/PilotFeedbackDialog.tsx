import { useMutation } from "@tanstack/react-query";
import { MessageSquareWarning, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { api } from "../lib/api";
import { pilotTelemetryEnabled, recordPilotEvent, setPilotTelemetryEnabled } from "../lib/pilotTelemetry";

type FeedbackCategory = "bug" | "usability" | "data_migration" | "performance" | "feature_request";

export function PilotFeedbackDialog({ organizationId, documentId, onClose }: { organizationId: string; documentId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  useEscapeClose(onClose, true);
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [telemetry, setTelemetry] = useState(pilotTelemetryEnabled());
  const submit = useMutation({
    mutationFn: () => api(`/organizations/${organizationId}/pilot-feedback`, { method: "POST", body: JSON.stringify({ category, title, description, context: { route: window.location.pathname, ...(documentId ? { documentId } : {}), clientVersion: "0.1.5" } }) }),
    onSuccess: onClose,
  });
  const onSubmit = (event: FormEvent) => { event.preventDefault(); submit.mutate(); };
  return <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pilot-feedback-title">
    <form data-testid="pilot-feedback-dialog" className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surfaceElevated shadow-2xl" onSubmit={onSubmit}>
      <header className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><MessageSquareWarning size={19} /></span><div><h2 id="pilot-feedback-title" className="font-semibold">{t("pilotFeedback")}</h2><p className="text-xs text-mutedForeground">{t("pilotFeedbackHelp")}</p></div></div><button type="button" aria-label={t("close")} className="rounded-lg p-2 hover:bg-muted" onClick={onClose}><X size={17} /></button></header>
      <div className="space-y-4 p-5">
        <label className="block text-sm"><span className="font-medium">{t("feedbackCategoryLabel")}</span><select data-testid="feedback-category" className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-3 py-2" value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)}>{(["bug", "usability", "data_migration", "performance", "feature_request"] as const).map((value) => <option key={value} value={value}>{t(`feedbackCategory.${value}`)}</option>)}</select></label>
        <label className="block text-sm"><span className="font-medium">{t("feedbackTitle")}</span><input data-testid="feedback-title" className="mt-1 w-full rounded-lg border border-border bg-editorBackground px-3 py-2" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="block text-sm"><span className="font-medium">{t("feedbackDescription")}</span><textarea data-testid="feedback-description" className="mt-1 min-h-32 w-full rounded-lg border border-border bg-editorBackground px-3 py-2" maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label className="flex items-start gap-3 rounded-xl border border-border bg-editorBackground p-3 text-sm"><input data-testid="pilot-telemetry-consent" type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={telemetry} onChange={(event) => { setTelemetry(event.target.checked); setPilotTelemetryEnabled(event.target.checked); if (event.target.checked) void recordPilotEvent(organizationId, "feedback_opened"); }} /><span><span className="block font-medium">{t("pilotTelemetry")}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t("pilotTelemetryHelp")}</span></span></label>
        {submit.isError && <p className="text-sm text-destructive">{t("operationFailed")}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border px-5 py-4"><button type="button" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>{t("cancel")}</button><button data-testid="submit-pilot-feedback" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primaryForeground disabled:opacity-40" disabled={title.trim().length < 3 || description.trim().length < 10 || submit.isPending}>{t("sendFeedback")}</button></footer>
    </form>
  </div>;
}
