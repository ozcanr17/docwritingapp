import { Check, ChevronLeft, ChevronRight, FileText, GitBranch, PlayCircle, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const steps = [
  { key: "workspace", icon: FileText },
  { key: "authoring", icon: Check },
  { key: "traceability", icon: GitBranch },
  { key: "verification", icon: PlayCircle },
] as const;

export function OnboardingDialog({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const step = steps[index] ?? steps[0];
  const Icon = step.icon;
  const last = index === steps.length - 1;
  return <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
    <section data-testid="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surfaceElevated shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="text-xs font-medium uppercase tracking-wide text-primary">{t("onboardingEyebrow")}</div><h2 id="onboarding-title" className="mt-0.5 text-lg font-semibold">{t("onboardingTitle")}</h2></div><button type="button" aria-label={t("skipOnboarding")} title={t("skipOnboarding")} className="rounded-lg p-1.5 hover:bg-muted" onClick={onComplete}><X size={17} /></button></div>
      <div className="p-6">
        <div className="flex min-h-56 flex-col items-center justify-center text-center"><span className="rounded-2xl bg-primary/10 p-4 text-primary"><Icon size={28} /></span><h3 className="mt-4 text-xl font-semibold">{t(`onboarding.${step.key}.title`)}</h3><p className="mt-2 max-w-md text-sm leading-6 text-mutedForeground">{t(`onboarding.${step.key}.description`)}</p><div className="mt-4 rounded-xl border border-border bg-editorBackground px-4 py-3 text-sm">{t(`onboarding.${step.key}.tip`)}</div></div>
        <div className="mt-5 flex justify-center gap-1.5" aria-label={t("onboardingProgress")}>{steps.map((item, itemIndex) => <span key={item.key} className={`h-1.5 rounded-full transition-all ${itemIndex === index ? "w-8 bg-primary" : "w-2 bg-border"}`} />)}</div>
      </div>
      <div className="flex items-center justify-between border-t border-border px-5 py-4"><button type="button" className="text-sm text-mutedForeground hover:text-foreground" onClick={onComplete}>{t("skipOnboarding")}</button><div className="flex gap-2">{index > 0 && <button type="button" data-testid="onboarding-previous" className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={() => setIndex((current) => current - 1)}><ChevronLeft size={15} />{t("previous")}</button>}<button type="button" data-testid={last ? "onboarding-complete" : "onboarding-next"} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primaryForeground" onClick={() => last ? onComplete() : setIndex((current) => current + 1)}>{t(last ? "startUsingDocSys" : "next")}{!last && <ChevronRight size={15} />}</button></div></div>
    </section>
  </div>;
}
