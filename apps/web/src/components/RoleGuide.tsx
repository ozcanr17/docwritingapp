import { Eye, FilePenLine, ShieldCheck, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

const roles = [
  { key: "viewer", icon: Eye },
  { key: "editor", icon: FilePenLine },
  { key: "reviewer", icon: UserCheck },
  { key: "administrator", icon: ShieldCheck },
] as const;

export function RoleGuide() {
  const { t } = useTranslation();
  return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">{roles.map((role) => { const Icon = role.icon; return <article key={role.key} data-testid={`role-guide-${role.key}`} className="rounded-xl border border-border bg-editorBackground p-4"><div className="flex items-center gap-2 font-medium"><span className="rounded-lg bg-primary/10 p-1.5 text-primary"><Icon size={15} /></span>{t(`roleName.${role.key}`)}</div><p className="mt-2 text-xs leading-5 text-mutedForeground">{t(`roleDescription.${role.key}`)}</p></article>; })}</div><p className="rounded-lg border border-info/25 bg-info/10 px-3 py-2 text-xs text-info">{t("roleGuideScopeHelp")}</p></div>;
}
