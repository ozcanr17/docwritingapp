import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, FileCog, Keyboard, Plug, RotateCcw, ShieldCheck, SlidersHorizontal, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DocumentSummary } from "../lib/api";
import { useToastStore } from "../stores/toasts";
import { DocumentFontFamily, documentFontFamilies, useAuthoringPreferencesStore } from "../stores/authoringPreferences";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { RoleGuide } from "./RoleGuide";
import { useEscapeClose } from "../hooks/useEscapeClose";

export function WorkspaceSettingsDialog({ organizationId, workspaceId, documentId, onClose }: { organizationId: string; workspaceId: string; documentId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const [tab, setTab] = useState<"document" | "authoring" | "keyboard" | "roles" | "configurations" | "integrations" | "sso">("authoring");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("variant");
  const [integrationUrl, setIntegrationUrl] = useState("");
  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [requirementPrefix, setRequirementPrefix] = useState("REQ");
  const preferences = useAuthoringPreferencesStore();
  const configurations = useQuery({ queryKey: ["configurations", workspaceId], queryFn: () => api<Array<{ id: string; name: string; kind: string; createdAt: string }>>(`/workspaces/${workspaceId}/configurations`) });
  const integrations = useQuery({ queryKey: ["integrations", organizationId], queryFn: () => api<Array<{ id: string; name: string; integrationType: string; enabled: boolean }>>(`/organizations/${organizationId}/integrations`) });
  const document = useQuery({ queryKey: ["document", documentId], queryFn: () => api<DocumentSummary>(`/documents/${documentId}`), enabled: documentId !== null });
  useEffect(() => {
    if (document.data?.documentType === "requirement") setRequirementPrefix(document.data.requirementPrefix ?? "REQ");
  }, [document.data]);
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
  const updateDocument = useMutation({
    mutationFn: () => api<DocumentSummary>(`/documents/${documentId}`, { method: "PATCH", body: JSON.stringify({ expectedVersion: document.data?.version, requirementPrefix: requirementPrefix.toUpperCase() }) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["document", documentId], updated);
      void queryClient.invalidateQueries({ queryKey: ["tree", workspaceId] });
      toast("success", t("documentSettingsSaved"));
    },
    onError: () => toast("error", t("genericError")),
  });
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div data-testid="workspace-settings-dialog" className="flex max-h-[82vh] w-[46rem] flex-col rounded-2xl border border-border bg-surfaceElevated p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{t("workspaceSettings")}</h2><button data-testid="close-workspace-settings" aria-label={t("close")} onClick={onClose}><X size={17} /></button></div>
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
          {document.data?.documentType === "requirement" && <Tab active={tab === "document"} onClick={() => setTab("document")} icon={<FileCog size={14} />} label={t("documentSettings")} />}
          <Tab active={tab === "authoring"} onClick={() => setTab("authoring")} icon={<SlidersHorizontal size={14} />} label={t("authoringSettings")} />
          <Tab active={tab === "keyboard"} onClick={() => setTab("keyboard")} icon={<Keyboard size={14} />} label={t("keyboardShortcuts")} />
          <Tab active={tab === "roles"} onClick={() => setTab("roles")} icon={<Users size={14} />} label={t("rolesAndAccess")} />
          <Tab active={tab === "configurations"} onClick={() => setTab("configurations")} icon={<Boxes size={14} />} label={t("configurations")} />
          <Tab active={tab === "integrations"} onClick={() => setTab("integrations")} icon={<Plug size={14} />} label={t("integrations")} />
          <Tab active={tab === "sso"} onClick={() => setTab("sso")} icon={<ShieldCheck size={14} />} label={t("sso")} />
        </div>
        <div className="min-h-0 overflow-auto">
        {tab === "document" && document.data?.documentType === "requirement" && <SettingsSection title={t("requirementNumberingSettings")} description={t("requirementNumberingSettingsHelp")}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(requirementPrefix)) updateDocument.mutate(); }}>
            <label className="block text-sm"><span className="font-medium">{t("requirementPrefix")}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t("requirementPrefixHelp")}</span><div className="mt-2 flex items-center gap-2"><input data-testid="requirement-prefix" className="w-40 rounded-lg border border-border bg-editorBackground px-3 py-2 uppercase" maxLength={20} value={requirementPrefix} onChange={(event) => setRequirementPrefix(event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} /><span className="font-mono text-sm text-mutedForeground">{`${requirementPrefix || "REQ"}-001`}</span></div></label>
            <button data-testid="save-requirement-prefix" className="rounded-lg bg-primary px-3 py-2 text-sm text-primaryForeground disabled:opacity-50" disabled={!/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(requirementPrefix) || updateDocument.isPending}>{t("save")}</button>
          </form>
        </SettingsSection>}
        {tab === "authoring" && <div className="space-y-4">
          <SettingsSection title={t("documentAppearanceSettings")} description={t("documentAppearanceSettingsHelp")}>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceButton active={preferences.rowDensity === "comfortable"} label={t("comfortableDensity")} onClick={() => preferences.setRowDensity("comfortable")} />
              <ChoiceButton active={preferences.rowDensity === "compact"} label={t("compactDensity")} onClick={() => preferences.setRowDensity("compact")} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="rounded-lg border border-border bg-editorBackground p-3 text-sm"><span className="block font-medium">{t("documentFontSize")}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t("documentFontSizeHelp")}</span><select data-testid="document-font-size" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-1.5" value={preferences.documentFontSize} onChange={(event) => preferences.setDocumentFontSize(Number(event.target.value))}>{[12, 13, 14, 15, 16, 18, 20].map((size) => <option key={size} value={size}>{size} px</option>)}</select></label>
              <label className="rounded-lg border border-border bg-editorBackground p-3 text-sm"><span className="block font-medium">{t("documentFontFamily")}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t("documentFontFamilyHelp")}</span><select data-testid="document-font-family" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-1.5" value={preferences.documentFontFamily} onChange={(event) => preferences.setDocumentFontFamily(event.target.value as DocumentFontFamily)}><option value="system">{t("fontSystem")}</option><option value="sans">{t("fontSans")}</option><option value="serif">{t("fontSerif")}</option><option value="mono">{t("fontMono")}</option></select></label>
            </div>
            <div data-testid="document-font-preview" className="rounded-lg border border-dashed border-border bg-surface px-4 py-3" style={{ fontFamily: documentFontFamilies[preferences.documentFontFamily], fontSize: preferences.documentFontSize }}>{t("documentFontPreview")}</div>
            <ToggleRow label={t("showHierarchyGuides")} description={t("showHierarchyGuidesHelp")} checked={preferences.showHierarchyGuides} onChange={preferences.setShowHierarchyGuides} />
            <ToggleRow label={t("showChangeIndicators")} description={t("showChangeIndicatorsHelp")} checked={preferences.showChangeIndicators} onChange={preferences.setShowChangeIndicators} />
          </SettingsSection>
          <SettingsSection title={t("authoringBehaviorSettings")} description={t("authoringBehaviorSettingsHelp")}>
            <ToggleRow label={t("enableSpellCheck")} description={t("enableSpellCheckHelp")} checked={preferences.spellCheck} onChange={preferences.setSpellCheck} />
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-editorBackground p-3 text-sm"><span><span className="block font-medium">{t("defaultFrozenColumns")}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t("defaultFrozenColumnsHelp")}</span></span><select className="rounded-lg border border-border bg-surface px-3 py-1.5" value={preferences.defaultFrozenColumns} onChange={(event) => preferences.setDefaultFrozenColumns(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          </SettingsSection>
          <div className="flex justify-end"><button className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={preferences.reset}><RotateCcw size={14} />{t("restoreDefaults")}</button></div>
        </div>}
        {tab === "keyboard" && <SettingsSection title={t("keyboardShortcuts")} description={t("keyboardShortcutsHelp")}><KeyboardShortcutsSettings /></SettingsSection>}
        {tab === "roles" && <SettingsSection title={t("rolesAndAccess")} description={t("rolesAndAccessHelp")}><RoleGuide /></SettingsSection>}
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
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border p-4"><h3 className="text-sm font-semibold">{title}</h3><p className="mb-3 mt-1 text-xs text-mutedForeground">{description}</p><div className="space-y-2">{children}</div></section>;
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-editorBackground p-3 text-sm"><span><span className="block font-medium">{label}</span><span className="mt-0.5 block text-xs text-mutedForeground">{description}</span></span><input type="checkbox" className="h-4 w-4 accent-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function ChoiceButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={`rounded-lg border px-3 py-2 text-sm ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-editorBackground hover:bg-muted"}`} onClick={onClick}>{label}</button>;
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button className={`flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-surface shadow-sm" : "text-mutedForeground"}`} onClick={onClick}>{icon}{label}</button>;
}
