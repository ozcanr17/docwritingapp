import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, CustomFieldType, DocumentType, FieldDefinition, OutlineRow } from "../lib/api";
import { columnsForDocument } from "../lib/columns";
import { setLanguage, storedLanguage } from "../lib/i18n";
import { useColumnStore } from "../stores/columns";
import { useSelectionStore } from "../stores/selection";
import { ThemeMode, useThemeStore } from "../stores/theme";
import { useToastStore } from "../stores/toasts";
import { Menu, MenuEntry } from "./Menu";
import { AddColumnDialog } from "./AddColumnDialog";
import { NotificationCenter } from "./NotificationCenter";

interface MenuBarProps {
  documentId: string | null;
  documentType: DocumentType | null;
  view: "documents" | "trash";
  setView: (view: "documents" | "trash") => void;
  onOpenReport: (tab: "readiness" | "baselines" | "coverage" | "matrix" | "reviews" | "runs") => void;
  onOpenHistory: (mode: "row" | "document") => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchOpen: boolean;
  onOpenCommandPalette?: () => void;
  commandPaletteShortcut?: string;
  searchShortcut?: string;
  onOpenOnboarding?: () => void;
}

function slugifyKey(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(base) ? base : `c_${base || "field"}`;
}

async function pollExport(jobId: string): Promise<{ ready: boolean; status: string }> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await api<{ status: string; ready: boolean }>(`/exports/${jobId}`);
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("timeout");
}

export function MenuBar({ documentId, documentType, view, setView, onOpenReport, onOpenHistory, onOpenSearch, onCloseSearch, searchQuery, onSearchQueryChange, searchOpen, onOpenCommandPalette = () => undefined, commandPaletteShortcut = "", searchShortcut = "", onOpenOnboarding = () => undefined }: MenuBarProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const selectedRowId = useSelectionStore((s) => s.selectedRowId);
  const hiddenByDocument = useColumnStore((s) => s.hidden);
  const hiddenColumns = documentId ? hiddenByDocument[documentId] ?? [] : [];
  const toggleColumn = useColumnStore((s) => s.toggle);
  const fileInput = useRef<HTMLInputElement>(null);
  const reqifInput = useRef<HTMLInputElement>(null);
  const xlsxInput = useRef<HTMLInputElement>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);

  const gridDoc = documentId !== null && (documentType === "requirement" || documentType === "test") && view === "documents";

  const { data: fields = [] } = useQuery({
    queryKey: ["fields", documentId],
    queryFn: () => api<FieldDefinition[]>(`/documents/${documentId}/fields`),
    enabled: gridDoc,
  });
  const { data: outline = [] } = useQuery({
    queryKey: ["outline", documentId],
    queryFn: () => api<OutlineRow[]>(`/documents/${documentId}/outline`),
    enabled: gridDoc,
  });
  const selectedRow = outline.find((row) => row.id === selectedRowId);

  const invalidateOutline = () =>
    Promise.all([
      queryClient.refetchQueries({ queryKey: ["outline", documentId], exact: true }),
      queryClient.refetchQueries({ queryKey: ["fields", documentId], exact: true }),
    ]);

  const runExport = useMutation({
    mutationFn: async (format: "csv" | "docx" | "xlsx" | "pdf" | "reqif") => {
      const created = await api<{ id: string }>(`/documents/${documentId}/exports`, {
        method: "POST",
        body: JSON.stringify({ format, locale: storedLanguage() }),
      });
      const job = await pollExport(created.id);
      if (!job.ready) throw new Error("failed");
      return (await api<{ url: string }>(`/exports/${created.id}/download`)).url;
    },
    onSuccess: (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
      pushToast("success", t("exportReady"));
    },
    onError: () => pushToast("error", t("genericError")),
  });

  const importCsv = useMutation({
    mutationFn: (csv: string) => api(`/documents/${documentId}/imports`, { method: "POST", body: JSON.stringify({ csv }) }),
    onSuccess: async () => {
      await invalidateOutline();
      pushToast("success", t("importCsv"));
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const importReqif = useMutation({
    mutationFn: (reqif: string) => api(`/documents/${documentId}/imports/reqif`, { method: "POST", body: JSON.stringify({ reqif }) }),
    onSuccess: async () => {
      await invalidateOutline();
      pushToast("success", t("importReqif"));
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const importXlsx = useMutation({
    mutationFn: (data: string) => api(`/documents/${documentId}/imports/xlsx`, { method: "POST", body: JSON.stringify({ data }) }),
    onSuccess: async () => { await invalidateOutline(); pushToast("success", t("importXlsx")); },
    onError: () => pushToast("error", t("genericError")),
  });

  const insertRow = useMutation({
    mutationFn: (input: { parentId: string | null; afterRowId?: string; rowType: OutlineRow["rowType"] }) =>
      api(`/documents/${documentId}/rows`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ ...input, title: "" }),
      }),
    onSettled: () => invalidateOutline(),
    onError: () => pushToast("error", t("genericError")),
  });

  const addColumn = useMutation({
    mutationFn: (input: { displayName: string; fieldType: CustomFieldType; allowedValues: string[] }) =>
      api(`/documents/${documentId}/fields`, {
        method: "POST",
        body: JSON.stringify({
          fieldKey: `${slugifyKey(input.displayName)}_${Date.now().toString(36)}`,
          displayName: input.displayName,
          fieldType: input.fieldType,
          allowedValues: input.allowedValues,
          displayOrder: fields.length,
        }),
      }),
    onSuccess: () => {
      setAddColumnOpen(false);
      void invalidateOutline();
    },
    onError: () => pushToast("error", t("genericError")),
  });

  const isDocumentsView = view === "documents";
  const isTrashView = view === "trash";
  const fileEntry: MenuEntry[] = [
    ...(gridDoc
      ? [
          {
            key: "import",
            label: t("import"),
            children: [
              { key: "import-csv", label: t("importCsv"), onSelect: () => fileInput.current?.click() },
              { key: "import-xlsx", label: t("importXlsx"), onSelect: () => xlsxInput.current?.click() },
              { key: "import-reqif", label: t("importReqif"), onSelect: () => reqifInput.current?.click() },
            ],
          },
          {
            key: "export",
            label: t("export"),
            children: [
              { key: "export-csv", label: t("exportCsv"), onSelect: () => runExport.mutate("csv") },
              { key: "export-docx", label: t("exportDocx"), onSelect: () => runExport.mutate("docx") },
              { key: "export-xlsx", label: t("exportXlsx"), onSelect: () => runExport.mutate("xlsx") },
              { key: "export-pdf", label: t("exportPdf"), onSelect: () => runExport.mutate("pdf") },
              { key: "export-reqif", label: t("exportReqif"), onSelect: () => runExport.mutate("reqif") },
            ],
          },
          { key: "baselines", label: t("baselines"), onSelect: () => onOpenReport("baselines") },
          { key: "sep1", label: "", separator: true },
        ]
      : []),
    { key: "docs", label: t("documents"), onSelect: () => setView("documents"), checked: isDocumentsView },
    { key: "trash", label: t("trash"), onSelect: () => setView("trash"), checked: isTrashView },
  ];

  const editEntries: MenuEntry[] = [
    { key: "command-palette", label: t("commandPalette"), shortcut: commandPaletteShortcut, onSelect: onOpenCommandPalette },
    { key: "command-sep", label: "", separator: true },
    { key: "selected-row-history", label: t("selectedRowHistory"), disabled: !gridDoc || !selectedRowId, onSelect: () => onOpenHistory("row") },
    { key: "document-history", label: t("documentHistory"), disabled: !gridDoc, onSelect: () => onOpenHistory("document") },
    { key: "history-sep", label: "", separator: true },
    {
      key: "add-object",
      label: `${t("addObject")}\tInsert`,
      disabled: !gridDoc,
      onSelect: () => insertRow.mutate({
        parentId: selectedRow?.parentId ?? null,
        afterRowId: selectedRow?.id,
        rowType: "heading",
      }),
    },
    {
      key: "add-blank-object",
      label: t("addBlankObject"),
      disabled: !gridDoc,
      onSelect: () => insertRow.mutate({ parentId: selectedRow?.parentId ?? null, afterRowId: selectedRow?.id, rowType: "note" }),
    },
    {
      key: "add-object-below",
      label: `${t("addObjectBelow")}\tShift+Insert`,
      disabled: !gridDoc || !selectedRow || (selectedRow.rowType !== "heading" && selectedRow.rowType !== "test_case"),
      onSelect: () => selectedRow && insertRow.mutate({ parentId: selectedRow.id, rowType: "heading" }),
    },
    {
      key: "add-blank-object-below",
      label: t("addBlankObjectBelow"),
      disabled: !gridDoc || !selectedRow || (selectedRow.rowType !== "heading" && selectedRow.rowType !== "test_case"),
      onSelect: () => selectedRow && insertRow.mutate({ parentId: selectedRow.id, rowType: "note" }),
    },
    { key: "object-sep", label: "", separator: true },
    { key: "add-heading", label: t("addTopLevelHeading"), disabled: !gridDoc, onSelect: () => insertRow.mutate({ parentId: null, rowType: "heading" }) },
    {
      key: "add-child-heading",
      label: t("addChildHeading"),
      disabled: !gridDoc || !selectedRow || (selectedRow.rowType !== "heading" && selectedRow.rowType !== "test_case"),
      onSelect: () => selectedRow && insertRow.mutate({ parentId: selectedRow.id, rowType: "heading" }),
    },
    ...(documentType === "requirement"
      ? [{ key: "add-requirement", label: t("addRequirement"), disabled: !gridDoc, onSelect: () => insertRow.mutate({ parentId: null, rowType: "requirement" as const }) }]
      : []),
    ...(documentType === "test"
      ? [{ key: "add-test-template", label: t("addTestTemplate"), disabled: !gridDoc, onSelect: () => window.dispatchEvent(new CustomEvent("docsys:add-test-template", { detail: { parentId: selectedRow?.rowType === "heading" ? selectedRow.id : null } })) }]
      : []),
    {
      key: "add-test-step",
      label: t("addTestStep"),
      disabled: documentType !== "test",
      onSelect: () => insertRow.mutate({ parentId: selectedRow?.rowType === "heading" ? selectedRow.id : null, rowType: "test_step" }),
    },
    { key: "sep", label: "", separator: true },
    { key: "delete", label: t("deleteAction"), danger: true, disabled: !gridDoc || !selectedRowId, onSelect: () => window.dispatchEvent(new Event("docsys:delete-selected-row")) },
  ];

  const themeItem = (mode: ThemeMode, label: string): MenuEntry => ({
    key: `theme-${mode}`,
    label,
    checked: themeMode === mode,
    onSelect: () => setThemeMode(mode),
  });

  const viewEntries: MenuEntry[] = [
    themeItem("light", t("themeLight")),
    themeItem("dark", t("themeDark")),
    themeItem("system", t("themeSystem")),
    { key: "sep", label: "", separator: true },
    { key: "lang-tr", label: t("langTurkish"), checked: storedLanguage() === "tr", onSelect: () => setLanguage("tr") },
    { key: "lang-en", label: t("langEnglish"), checked: storedLanguage() === "en", onSelect: () => setLanguage("en") },
  ];

  const insertEntries: MenuEntry[] = [
    { key: "add-column", label: t("addColumn"), disabled: !gridDoc, onSelect: () => setAddColumnOpen(true) },
  ];

  const columnEntries: MenuEntry[] = (documentType === "requirement" || documentType === "test"
    ? columnsForDocument(documentType, fields)
    : [])
    .filter((c) => c.key !== "number")
    .map((column) => ({
      key: `col-${column.key}`,
      label: column.kind === "custom" ? column.labelKey : t(column.labelKey),
      checked: documentId ? !hiddenColumns.includes(column.key) : false,
      onSelect: () => documentId && toggleColumn(documentId, column.key),
    }));

  const analysisEntries: MenuEntry[] = [
    { key: "readiness", label: t("releaseReadiness"), onSelect: () => onOpenReport("readiness") },
    { key: "readiness-sep", label: "", separator: true },
    { key: "coverage", label: t("coverageReport"), onSelect: () => onOpenReport("coverage") },
    { key: "matrix", label: t("traceabilityMatrix"), onSelect: () => onOpenReport("matrix") },
    { key: "reviews", label: t("reviews"), onSelect: () => onOpenReport("reviews") },
    { key: "runs", label: t("testRuns"), onSelect: () => onOpenReport("runs") },
  ];

  const helpEntries: MenuEntry[] = [
    { key: "onboarding", label: t("openGettingStarted"), onSelect: onOpenOnboarding },
    { key: "help-sep", label: "", separator: true },
    { key: "about", label: t("about"), onSelect: () => pushToast("info", `${t("appName")} — ${t("aboutText")}`) },
  ];

  return (
    <>
    <div className="relative z-50 grid grid-cols-[auto_minmax(12rem,34rem)_minmax(0,1fr)] items-center gap-2 border-b border-border bg-surface/90 px-2 py-1 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-0.5">
        <span className="shrink-0 px-2 text-sm font-semibold">{t("appName")}</span>
        <Menu testId="menu-file" label={t("menuFile")} entries={fileEntry} />
        <Menu testId="menu-edit" label={t("menuEdit")} entries={editEntries} />
        <Menu testId="menu-view" label={t("menuView")} entries={viewEntries} />
      </div>
      <div
        id="docsys-global-search"
        data-testid="global-search-trigger"
        title={t("globalSearchHelp")}
        className={`flex min-w-0 items-center gap-2 border border-border bg-editorBackground/80 px-3 py-1.5 text-xs text-mutedForeground shadow-sm transition-colors focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-primary/10 hover:border-primary/35 hover:bg-muted ${searchOpen ? "rounded-t-xl rounded-b-none border-b-transparent bg-surfaceElevated" : "rounded-lg"}`}
      >
        <Search size={14} className="shrink-0" />
        <input
          id="docsys-global-search-input"
          data-testid="global-search-input"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-mutedForeground"
          value={searchQuery}
          placeholder={t("globalSearchHelp")}
          onFocus={onOpenSearch}
          onChange={(event) => {
            onSearchQueryChange(event.target.value);
            onOpenSearch();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onCloseSearch();
              event.currentTarget.blur();
            }
          }}
        />
        {!searchQuery && <span className="shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px]">{searchShortcut}</span>}
      </div>
      <div data-testid="menubar-trailing-actions" className="flex min-w-0 items-center justify-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Menu testId="menu-insert" label={t("menuInsert")} entries={insertEntries} />
        {gridDoc && <Menu testId="menu-columns" label={t("menuColumns")} entries={columnEntries} />}
        {gridDoc && <Menu testId="menu-analysis" label={t("menuAnalysis")} entries={analysisEntries} />}
        <Menu testId="menu-help" label={t("menuHelp")} entries={helpEntries} />
        <span className="ml-auto shrink-0"><NotificationCenter /></span>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        data-testid="menubar-file-input"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          importCsv.mutate(await file.text());
          event.target.value = "";
        }}
      />
      <input
        ref={xlsxInput}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          importXlsx.mutate(btoa(binary));
          event.target.value = "";
        }}
      />
      <input
        ref={reqifInput}
        type="file"
        accept=".reqif,.xml,application/xml,text/xml"
        className="hidden"
        data-testid="menubar-reqif-input"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          importReqif.mutate(await file.text());
          event.target.value = "";
        }}
      />
    </div>
    {addColumnOpen && (
      <AddColumnDialog
        onClose={() => setAddColumnOpen(false)}
        onSubmit={(input) => addColumn.mutate(input)}
      />
    )}
    </>
  );
}
