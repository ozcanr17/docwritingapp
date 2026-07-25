import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Accessibility, Bell, FileCog, Keyboard, Palette, PenLine, Plug, RotateCcw, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DocumentSummary } from "../lib/api";
import { setLanguage, storedLanguage } from "../lib/i18n";
import { useToastStore } from "../stores/toasts";
import { useThemeStore } from "../stores/theme";
import { DocumentFontFamily, documentFontFamilies, useAuthoringPreferencesStore } from "../stores/authoringPreferences";
import { SettingsSection as SettingsSectionId } from "../lib/appSections";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { RoleGuide } from "./RoleGuide";
import { pilotTelemetryEnabled, setPilotTelemetryEnabled } from "../lib/pilotTelemetry";
import { ModalSurface } from "./TransientSurface";
import { userFacingError } from "../lib/userFacingError";

export function WorkspaceSettingsDialog({ organizationId, workspaceId, documentId, onClose, variant = "dialog", section, onSectionChange }: { organizationId: string; workspaceId: string; documentId: string | null; onClose: () => void; variant?: "dialog" | "page"; section?: SettingsSectionId; onSectionChange?: (section: SettingsSectionId) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToastStore((state) => state.push);
  const themeMode = useThemeStore((state) => state.mode);
  const setThemeMode = useThemeStore((state) => state.setMode);
  const [internalTab, setInternalTab] = useState<SettingsSectionId>("appearance");
  const tab = section ?? internalTab;
  const setTab = onSectionChange ?? setInternalTab;
  const [pilotTelemetry, setPilotTelemetry] = useState(pilotTelemetryEnabled());
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
    onError: (error) => toast("error", userFacingError(error, t)),
  });
  const createIntegration = useMutation({
    mutationFn: () => api(`/organizations/${organizationId}/integrations`, { method: "POST", body: JSON.stringify({ name: name || "Webhook", integrationType: "webhook", configuration: { url: integrationUrl }, enabled: true }) }),
    onSuccess: () => { setName(""); setIntegrationUrl(""); void queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] }); },
    onError: (error) => toast("error", userFacingError(error, t)),
  });
  const configureSso = useMutation({
    mutationFn: () => {
      const base = issuer.replace(/\/$/, "");
      return api(`/organizations/${organizationId}/sso`, { method: "POST", body: JSON.stringify({ issuer, clientId, authorizationEndpoint: `${base}/authorize`, tokenEndpoint: `${base}/token`, scopes: ["openid", "profile", "email"], enabled: true }) });
    },
    onSuccess: () => toast("success", t("ssoSaved")),
    onError: (error) => toast("error", userFacingError(error, t)),
  });
  const updateDocument = useMutation({
    mutationFn: () => api<DocumentSummary>(`/documents/${documentId}`, { method: "PATCH", body: JSON.stringify({ expectedVersion: document.data?.version, requirementPrefix: requirementPrefix.toUpperCase() }) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["document", documentId], updated);
      void queryClient.invalidateQueries({ queryKey: ["tree", workspaceId] });
      toast("success", t("documentSettingsSaved"));
    },
    onError: (error) => toast("error", userFacingError(error, t)),
  });
  const body = (
    <>
        {variant === "dialog" && <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 id="workspace-settings-title" className="font-semibold">{t("workspaceSettings")}</h2><p className="mt-0.5 text-xs text-mutedForeground">{t("workspaceSettingsDescription")}</p></div><button data-testid="close-workspace-settings" aria-label={t("close")} className="rounded-lg p-2 hover:bg-muted" onClick={onClose}><X size={17} /></button></div>}
        <div className={variant === "page" ? "flex min-h-0 flex-1" : "grid min-h-0 flex-1 md:grid-cols-[13rem_minmax(0,1fr)]"}>
        {variant === "dialog" && <nav aria-label={t("workspaceSettings")} className="flex gap-1 overflow-x-auto border-b border-border bg-surface p-3 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
          {document.data?.documentType === "requirement" && <Tab testId="settings-tab-document" active={tab === "document"} onClick={() => setTab("document")} icon={<FileCog size={15} />} label={t("documentSettings")} />}
          <Tab testId="settings-tab-appearance" active={tab === "appearance"} onClick={() => setTab("appearance")} icon={<Palette size={15} />} label={t("appearanceSettings")} />
          <Tab testId="settings-tab-authoring" active={tab === "authoring"} onClick={() => setTab("authoring")} icon={<PenLine size={15} />} label={t("authoringSettings")} />
          <Tab testId="settings-tab-keyboard" active={tab === "keyboard"} onClick={() => setTab("keyboard")} icon={<Keyboard size={15} />} label={t("keyboardShortcuts")} />
          <Tab testId="settings-tab-accessibility" active={tab === "accessibility"} onClick={() => setTab("accessibility")} icon={<Accessibility size={15} />} label={t("accessibilitySettings")} />
          <Tab testId="settings-tab-notifications" active={tab === "notifications"} onClick={() => setTab("notifications")} icon={<Bell size={15} />} label={t("notifications")} />
          <Tab testId="settings-tab-roles" active={tab === "roles"} onClick={() => setTab("roles")} icon={<Users size={15} />} label={t("rolesAndAccess")} />
          <Tab testId="settings-tab-integrations" active={tab === "integrations"} onClick={() => setTab("integrations")} icon={<Plug size={15} />} label={t("integrations")} />
        </nav>}
        <div className="mx-auto min-h-0 w-full max-w-4xl overflow-auto p-5">
        {tab === "document" && document.data?.documentType === "requirement" && <SettingsSection title={t("requirementNumberingSettings")} description={t("requirementNumberingSettingsHelp")}>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(requirementPrefix)) updateDocument.mutate(); }}>
            <label className="block text-sm"><span className="font-medium">{t("requirementPrefix")}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t("requirementPrefixHelp")}</span><div className="mt-2 flex items-center gap-2"><input data-testid="requirement-prefix" className="w-40 rounded-lg border border-border bg-editorBackground px-3 py-2 uppercase" maxLength={20} value={requirementPrefix} onChange={(event) => setRequirementPrefix(event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} /><span className="font-mono text-sm text-mutedForeground">{`${requirementPrefix || "REQ"}-001`}</span></div></label>
            <button data-testid="save-requirement-prefix" className="rounded-lg bg-primary px-3 py-2 text-sm text-primaryForeground disabled:opacity-50" disabled={!/^[A-Za-z][A-Za-z0-9]{0,19}$/.test(requirementPrefix) || updateDocument.isPending}>{t("save")}</button>
          </form>
        </SettingsSection>}
        {tab === "appearance" && <div className="space-y-4">
          <SettingsSection title={t("documentAppearanceSettings")} description={t("documentAppearanceSettingsHelp")}>
            <div className="grid grid-cols-3 gap-2">
              <ChoiceButton active={themeMode === "light"} label={t("themeLight")} onClick={() => setThemeMode("light")} />
              <ChoiceButton active={themeMode === "dark"} label={t("themeDark")} onClick={() => setThemeMode("dark")} />
              <ChoiceButton active={themeMode === "system"} label={t("themeSystem")} onClick={() => setThemeMode("system")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ChoiceButton testId="language-tr" active={storedLanguage() === "tr"} label={t("langTurkish")} onClick={() => setLanguage("tr")} />
              <ChoiceButton testId="language-en" active={storedLanguage() === "en"} label={t("langEnglish")} onClick={() => setLanguage("en")} />
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("rowDensity")}>
              <ChoiceButton active={preferences.rowDensity === "compact"} label={t("compactDensity")} onClick={() => preferences.setRowDensity("compact")} />
              <ChoiceButton active={preferences.rowDensity === "standard"} label={t("standardDensity")} onClick={() => preferences.setRowDensity("standard")} />
              <ChoiceButton active={preferences.rowDensity === "comfortable"} label={t("comfortableDensity")} onClick={() => preferences.setRowDensity("comfortable")} />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">{t("interfaceScale")}</div>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label={t("interfaceScale")}>
                {[100, 110, 125].map((scale) => <ChoiceButton key={scale} testId={`interface-scale-${scale}`} active={preferences.interfaceScale === scale} label={`${scale}%`} onClick={() => preferences.setInterfaceScale(scale as 100 | 110 | 125)} />)}
              </div>
              <p className="mt-1.5 text-xs text-mutedForeground">{t("interfaceScaleHelp")}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="rounded-lg border border-border bg-editorBackground p-3 text-sm"><span className="block font-medium">{t("documentFontSize")}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t("documentFontSizeHelp")}</span><select data-testid="document-font-size" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-1.5" value={preferences.documentFontSize} onChange={(event) => preferences.setDocumentFontSize(Number(event.target.value))}>{[12, 13, 14, 15, 16, 18, 20].map((size) => <option key={size} value={size}>{size} px</option>)}</select></label>
              <label className="rounded-lg border border-border bg-editorBackground p-3 text-sm"><span className="block font-medium">{t("documentFontFamily")}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t("documentFontFamilyHelp")}</span><select data-testid="document-font-family" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-1.5" value={preferences.documentFontFamily} onChange={(event) => preferences.setDocumentFontFamily(event.target.value as DocumentFontFamily)}><option value="system">{t("fontSystem")}</option><option value="sans">{t("fontSans")}</option><option value="serif">{t("fontSerif")}</option><option value="mono">{t("fontMono")}</option></select></label>
            </div>
            <div data-testid="document-font-preview" className="rounded-lg border border-dashed border-border bg-surface px-4 py-3" style={{ fontFamily: documentFontFamilies[preferences.documentFontFamily], fontSize: preferences.documentFontSize }}>{t("documentFontPreview")}</div>
          </SettingsSection>
        </div>}
        {tab === "authoring" && <div className="space-y-4">
          <SettingsSection title={t("authoringBehaviorSettings")} description={t("authoringBehaviorSettingsHelp")}>
            <ToggleRow label={t("enableSpellCheck")} description={t("enableSpellCheckHelp")} checked={preferences.spellCheck} onChange={preferences.setSpellCheck} />
            <ToggleRow label={t("showHierarchyGuides")} description={t("showHierarchyGuidesHelp")} checked={preferences.showHierarchyGuides} onChange={preferences.setShowHierarchyGuides} />
            <ToggleRow label={t("showChangeIndicators")} description={t("showChangeIndicatorsHelp")} checked={preferences.showChangeIndicators} onChange={preferences.setShowChangeIndicators} />
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-editorBackground p-3 text-sm"><span><span className="block font-medium">{t("defaultFrozenColumns")}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t("defaultFrozenColumnsHelp")}</span></span><select className="rounded-lg border border-border bg-surface px-3 py-1.5" value={preferences.defaultFrozenColumns} onChange={(event) => preferences.setDefaultFrozenColumns(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          </SettingsSection>
          <div className="flex justify-end"><button className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={preferences.reset}><RotateCcw size={14} />{t("restoreDefaults")}</button></div>
        </div>}
        {tab === "keyboard" && <SettingsSection title={t("keyboardShortcuts")} description={t("keyboardShortcutsHelp")}><KeyboardShortcutsSettings /></SettingsSection>}
        {tab === "accessibility" && <SettingsSection title={t("accessibilitySettings")} description={t("accessibilitySettingsHelp")}>
          <ToggleRow testId="setting-high-contrast" label={t("highContrast")} description={t("highContrastHelp")} checked={preferences.highContrast} onChange={preferences.setHighContrast} />
          <ToggleRow testId="setting-reduce-motion" label={t("reduceMotion")} description={t("reduceMotionHelp")} checked={preferences.reduceMotion} onChange={preferences.setReduceMotion} />
          <p className="rounded-lg border border-info/25 bg-info/10 p-3 text-xs leading-5 text-info">{t("accessibilityKeyboardNotice")}</p>
        </SettingsSection>}
        {tab === "notifications" && <div className="space-y-4">
          <SettingsSection title={t("notificationPreferences")} description={t("notificationPreferencesHelp")}>
            <ToggleRow label={t("notifyMentions")} description={t("notifyMentionsHelp")} checked={preferences.notifyMentions} onChange={preferences.setNotifyMentions} />
            <ToggleRow label={t("notifyAssignments")} description={t("notifyAssignmentsHelp")} checked={preferences.notifyAssignments} onChange={preferences.setNotifyAssignments} />
            <ToggleRow label={t("notifyReviewRequests")} description={t("notifyReviewRequestsHelp")} checked={preferences.notifyReviewRequests} onChange={preferences.setNotifyReviewRequests} />
          </SettingsSection>
          <SettingsSection title={t("privacyAndDiagnostics")} description={t("privacyAndDiagnosticsHelp")}><ToggleRow label={t("pilotTelemetry")} description={t("pilotTelemetryHelp")} checked={pilotTelemetry} onChange={(checked) => { setPilotTelemetry(checked); setPilotTelemetryEnabled(checked); }} /><p className="rounded-lg border border-border bg-editorBackground p-3 text-xs text-mutedForeground">{t("pilotTelemetryDataNotice")}</p></SettingsSection>
        </div>}
        {tab === "roles" && <SettingsSection title={t("rolesAndAccess")} description={t("rolesAndAccessHelp")}><RoleGuide /></SettingsSection>}
        {tab === "integrations" && <div className="space-y-4">
          <SettingsSection title={t("configurations")} description={t("configurationSettingsHelp")}>
            <div className="grid max-h-40 gap-2 sm:grid-cols-2 overflow-auto">{configurations.data?.map((item) => <div key={item.id} className="rounded-xl border border-border bg-editorBackground p-3"><div className="font-medium">{item.name}</div><div className="text-xs text-mutedForeground">{item.kind}</div></div>)}</div>
            <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) createConfiguration.mutate(); }}><input className="min-w-48 flex-1 rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder={t("configurationName")} value={name} onChange={(event) => setName(event.target.value)} /><select className="rounded-lg border border-border bg-editorBackground px-2" value={kind} onChange={(event) => setKind(event.target.value)}><option value="stream">Stream</option><option value="baseline">Baseline</option><option value="variant">Variant</option></select><button className="rounded-lg bg-primary px-3 text-primaryForeground">{t("create")}</button></form>
          </SettingsSection>
          <SettingsSection title={t("integrations")} description={t("integrationSettingsHelp")}>
            {integrations.data?.map((item) => <div key={item.id} className="flex justify-between rounded-xl border border-border bg-editorBackground p-3"><span>{item.name}</span><span className="text-xs text-mutedForeground">{item.integrationType}</span></div>)}
            <form className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]" onSubmit={(event) => { event.preventDefault(); if (integrationUrl.trim()) createIntegration.mutate(); }}><input className="rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder={t("name")} value={name} onChange={(event) => setName(event.target.value)} /><input type="url" className="rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder="https://..." value={integrationUrl} onChange={(event) => setIntegrationUrl(event.target.value)} /><button className="rounded-lg bg-primary px-3 text-primaryForeground">{t("add")}</button></form>
          </SettingsSection>
          <SettingsSection title={t("sso")} description={t("ssoHint")}>
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); configureSso.mutate(); }}><input type="url" className="w-full rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder="https://identity.example.com" value={issuer} onChange={(event) => setIssuer(event.target.value)} /><input className="w-full rounded-lg border border-border bg-editorBackground px-3 py-2" placeholder={t("clientId")} value={clientId} onChange={(event) => setClientId(event.target.value)} /><button className="rounded-lg bg-primary px-3 py-2 text-primaryForeground" disabled={!issuer || !clientId}>{t("save")}</button></form>
          </SettingsSection>
        </div>}
        </div>
        </div>
    </>
  );
  if (variant === "page") {
    return (
      <div data-testid="workspace-settings-dialog" aria-labelledby="workspace-settings-title" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
        {body}
      </div>
    );
  }
  return (
    <ModalSurface onClose={onClose} labelledBy="workspace-settings-title" testId="workspace-settings-dialog" panelClassName="flex max-h-[86vh] w-[60rem] max-w-full flex-col">
      {body}
    </ModalSurface>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-border p-4"><h3 className="text-sm font-semibold">{title}</h3><p className="mb-3 mt-1 text-xs text-mutedForeground">{description}</p><div className="space-y-2">{children}</div></section>;
}

function ToggleRow({ label, description, checked, onChange, testId }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void; testId?: string }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-editorBackground p-3 text-sm"><span><span className="block font-medium">{label}</span><span className="mt-0.5 block text-xs text-mutedForeground">{description}</span></span><input data-testid={testId} type="checkbox" className="h-4 w-4 accent-primary" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function ChoiceButton({ active, label, onClick, testId }: { active: boolean; label: string; onClick: () => void; testId?: string }) {
  return <button data-testid={testId} className={`rounded-lg border px-3 py-2 text-sm ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-editorBackground hover:bg-muted"}`} onClick={onClick}>{label}</button>;
}

function Tab({ active, onClick, icon, label, testId }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; testId?: string }) {
  return <button data-testid={testId} type="button" aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-surface text-primary shadow-sm" : "text-mutedForeground hover:bg-muted hover:text-foreground"}`} onClick={onClick}>{icon}{label}</button>;
}
