import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToastStore } from "../stores/toasts";
import { transientLayers } from "./TransientSurface";

const kindClasses: Record<string, string> = {
  info: "border-info",
  error: "border-destructive",
  success: "border-success",
};

export function Toasts() {
  const { t } = useTranslation();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div aria-live="polite" aria-atomic="false" className={`pointer-events-none fixed bottom-4 right-4 ${transientLayers.notification} flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2`}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid={`toast-${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border-l-4 ${kindClasses[toast.kind]} border border-border bg-surfaceElevated p-3 text-sm shadow-xl`}
        >
          <span className={toast.kind === "error" ? "text-destructive" : toast.kind === "success" ? "text-success" : "text-info"}>
            {toast.kind === "error" ? <AlertCircle size={17} /> : toast.kind === "success" ? <CheckCircle2 size={17} /> : <Info size={17} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="leading-5">{toast.message}</p>
            {toast.actionLabel && toast.onAction && <button className="mt-1.5 font-medium text-primary hover:underline" onClick={() => { toast.onAction?.(); dismiss(toast.id); }}>{toast.actionLabel}</button>}
          </div>
          <button aria-label={t("close")} className="rounded-md p-0.5 text-mutedForeground hover:bg-muted hover:text-foreground" onClick={() => dismiss(toast.id)}><X size={15} /></button>
        </div>
      ))}
    </div>
  );
}
