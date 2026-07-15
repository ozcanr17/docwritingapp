import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plug, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useToastStore } from "../stores/toasts";

export function WorkspaceSettingsDialog({ organizationId, workspaceId, onClose }: { organizationId: string; workspaceId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const [tab, setTab] = useState<"configurations" | "integrations" | "sso">("configurations");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("variant");
  const [integrationUrl, setIntegrationUrl] = useState("");
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const configurations = useQuery({ queryKey: ["configurations", workspaceId], queryFn: () => api<Array<{ id: string; name: string; kind: string; createdAt: string }>>(`/workspaces/${workspaceId}/configurations`) });
  const integrations = useQuery({ queryKey: ["integrations", organizationId], queryFn: () => api<Array<{ id: string; name: string; integrationType: string; enabled: boolean }>>(`/organizations/${organizationId}/integrations`) });
  const createConfiguration = useMutation({
    mutationFn: () => api(`/workspaces/${workspaceId}/configurations`, { method: "POST", body: JSON.stringify({ name, kind, rules: {} }) }),
    onSuccess: () => { setName(""); void queryClient.invalidateQueries({ queryKey: ["configurations", workspaceId] }); },
    onError: () => toast("error", t("genericError")),
  });
  const createIntegration = useMutation({
    mutationFn: () => api(`/organizations/${organizationId}/integrations`, { method: "POST", body: JSON.stringify({ name: name || "Webhook", integrationType: "webhook", configuration: { url: integrationUrl }, enabled: true }) }),
    onSuccess: () => { setName(""); setIntegrationUrl(""); void queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] }); },
    onError: () => toast("error", t("genericError")),
  });
  const configureSso = useMutation({
    mutationFn: () => {
      const base = issuer.replace(/\/$/, "");
      return api(`/organizations/${organizationId}/sso`, { method: "POST", body: JSON.stringify({ issuer, clientId, authorizationEndpoint: `${base}/authorize`, tokenEndpoint: `${base}/token`, scopes: ["openid", "profile", "email"], enabled: true }) });
    },
    onSuccess: () => toast("success", t("ssoSaved")),
    onError: () => toast("error", t("genericError")),
  });
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[42rem] rounded-2xl border border-border bg-surfaceElevated p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{t("workspaceSettings")}</h2><button onClick={onClose}><X size={17} /></button></div>
        <div className="mb-4 flex gap-1 rounded-xl bg-muted p-1">
          <Tab active={tab === "configurations"} onClick={() => setTab("configurations")} icon={<Boxes size={14} />} label={t("configurations")} />
          <Tab active={tab === "integrations"} onClick={() => setTab("integrations")} icon={<Plug size={14} />} label={t("integrations")} />
          <Tab active={tab === "sso"} onClick={() => setTab("sso")} icon={<ShieldCheck size={14} />} label={t("sso")} />
        </div>
        {tab === "configurations" && <div className="space-y-3">
          <div className="grid max-h-56 grid-cols-2 gap-2 overflow-auto">{configurations.data?.map((item) => <div key={item.id} className="rounded-xl border border-border bg-editorBackground p-3"><div className="font-medium">{item.name}</div><div className="text-xs text-mutedForeground">{item.kind}</div></div>)}</div>
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) createConfiguration.mutate(); }}><input className="min-w-0 flex-1 rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder={t("configurationName")} value={name} onChange={(event) => setName(event.target.value)} /><select className="rounded-lg border border-border bg-editorBackground px-2" value={kind} onChange={(event) => setKind(event.target.value)}><option value="stream">Stream</option><option value="baseline">Baseline</option><option value="variant">Variant</option></select><button className="rounded-lg bg-primary px-3 text-primaryForeground">{t("create")}</button></form>
        </div>}
        {tab === "integrations" && <div className="space-y-3">
          {integrations.data?.map((item) => <div key={item.id} className="flex justify-between rounded-xl border border-border bg-editorBackground p-3"><span>{item.name}</span><span className="text-xs text-mutedForeground">{item.integrationType}</span></div>)}
          <form className="grid grid-cols-[1fr_2fr_auto] gap-2" onSubmit={(event) => { event.preventDefault(); if (integrationUrl.trim()) createIntegration.mutate(); }}><input className="rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder={t("name")} value={name} onChange={(event) => setName(event.target.value)} /><input type="url" className="rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder="https://..." value={integrationUrl} onChange={(event) => setIntegrationUrl(event.target.value)} /><button className="rounded-lg bg-primary px-3 text-primaryForeground">{t("add")}</button></form>
        </div>}
        {tab === "sso" && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); configureSso.mutate(); }}><p className="text-sm text-mutedForeground">{t("ssoHint")}</p><input type="url" className="w-full rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder="https://identity.example.com" value={issuer} onChange={(event) => setIssuer(event.target.value)} /><input className="w-full rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder={t("clientId")} value={clientId} onChange={(event) => setClientId(event.target.value)} /><button className="rounded-lg bg-primary px-3 py-2 text-primaryForeground" disabled={!issuer || !clientId}>{t("save")}</button></form>}
      </div>
    </div>
  );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? "bg-surface shadow-sm" : "text-mutedForeground"}`} onClick={onClick}>{icon}{label}</button>;
}
