import { CheckCircle2, Circle, ClipboardCheck, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../hooks/useEscapeClose";

const keys = ["roles", "requirements", "tests", "migration", "traceability", "baseline", "backup"] as const;
const storageKey = "docsys.pilotChecklist";

function storedItems(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as string[]; } catch { return []; }
}

export function PilotChecklistDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  useEscapeClose(onClose, true);
  const [completed, setCompleted] = useState<string[]>(storedItems);
  const toggle = (key: string) => {
    const next = completed.includes(key) ? completed.filter((item) => item !== key) : [...completed, key];
    setCompleted(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { return; }
  };
  const percent = Math.round((completed.length / keys.length) * 100);
  return <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pilot-checklist-title">
    <section data-testid="pilot-checklist-dialog" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surfaceElevated shadow-2xl">
      <header className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><ClipboardCheck size={20} /></span><div><h2 id="pilot-checklist-title" className="font-semibold">{t("pilotChecklist")}</h2><p className="text-xs text-mutedForeground">{t("pilotChecklistHelp")}</p></div></div><button aria-label={t("close")} className="rounded-lg p-2 hover:bg-muted" onClick={onClose}><X size={17} /></button></header>
      <div className="p-5"><div className="mb-4 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} /></div><span className="text-xs font-medium">{percent}%</span></div><div className="space-y-2">{keys.map((key) => { const done = completed.includes(key); return <button key={key} data-testid={`pilot-check-${key}`} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${done ? "border-success/30 bg-success/5" : "border-border bg-editorBackground hover:bg-muted"}`} onClick={() => toggle(key)}><span className={done ? "text-success" : "text-mutedForeground"}>{done ? <CheckCircle2 size={19} /> : <Circle size={19} />}</span><span><span className="block text-sm font-medium">{t(`pilotChecklistItem.${key}.title`)}</span><span className="mt-0.5 block text-xs leading-5 text-mutedForeground">{t(`pilotChecklistItem.${key}.description`)}</span></span></button>; })}</div></div>
      <footer className="flex justify-end border-t border-border px-5 py-4"><button className="rounded-lg bg-primary px-3 py-2 text-sm text-primaryForeground" onClick={onClose}>{t("done")}</button></footer>
    </section>
  </div>;
}
