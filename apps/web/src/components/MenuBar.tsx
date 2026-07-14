import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { api, CustomFieldType, FieldDefinition, OutlineRow } from "../lib/api";
import { BUILTIN_COLUMNS, customColumns } from "../lib/columns";
import { setLanguage, storedLanguage } from "../lib/i18n";
import { useColumnStore } from "../stores/columns";
import { useSelectionStore } from "../stores/selection";
import { ThemeMode, useThemeStore } from "../stores/theme";
import { useToastStore } from "../stores/toasts";
import { Menu, MenuEntry } from "./Menu";

interface MenuBarProps {
  documentId: string | null;
  isTextDocument: boolean;
  view: "documents" | "trash";
  setView: (view: "documents" | "trash") => void;
  onOpenReport: (tab: "baselines" | "coverage") => void;
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

export function MenuBar({ documentId, isTextDocument, view, setView, onOpenReport }: MenuBarProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const selectedRowId = useSelectionStore((s) => s.selectedRowId);
  const isHidden = useColumnStore((s) => s.isHidden);
  const toggleColumn = useColumnStore((s) => s.toggle);
  const fileInput = useRef<HTMLInputElement>(null);

  const gridDoc = documentId !== null && !isTextDocument && view === "documents";

  const { data: fields = [] } = useQuery({
    queryKey: ["fields", documentId],
    queryFn: () => api<FieldDefinition[]>(`/documents/${documentId}/fields`),
    enabled: gridDoc,
  });

  const invalidateOutline = () => {
    void queryClient.invalidateQueries({ queryKey: ["outline", documentId] });
    void queryClient.invalidateQueries({ queryKey: ["fields", documentId] });
  };

  const runExport = useMutation({
    mutationFn: async (format: "csv" | "docx") => {
      const created = await api<{ id: string }>(`/documents/${documentId}/exports`, {
        method: "POST",
        body: JSON.stringify({ format }),
      });
      const job = await pollExport(created.id);
      if (!job.ready) throw new Error("failed");
      return (await api<{ url: string }>(`/exports/${created.id}/download`)).url;
    },
    onSuccess: (url) => {
      window.open(url, "_blank");
      pushToast("success", t("exportReady"));
    },
    onError: () => pushToast("error", t("genericError")),
  });

  const importCsv = useMutation({
    mutationFn: (csv: string) => api(`/documents/${documentId}/imports`, { method: "POST", body: JSON.stringify({ csv }) }),
    onSuccess: () => {
      invalidateOutline();
      pushToast("success", t("importCsv"));
    },
    onError: () => pushToast("error", t("genericError")),
  });

  const insertRow = useMutation({
    mutationFn: (input: { parentId: string | null; rowType: OutlineRow["rowType"] }) =>
      api(`/documents/${documentId}/rows`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ ...input, title: "" }),
      }),
    onSettled: invalidateOutline,
    onError: () => pushToast("error", t("genericError")),
  });

  const deleteRow = useMutation({
    mutationFn: (rowId: string) => api(`/rows/${rowId}`, { method: "DELETE", body: JSON.stringify({}) }),
    onSettled: invalidateOutline,
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
    onSuccess: invalidateOutline,
    onError: () => pushToast("error", t("genericError")),
  });

  const promptAddColumn = () => {
    const name = window.prompt(t("columnName"));
    if (!name) return;
    const type = (window.prompt(t("columnType"), "text") ?? "text").trim() as CustomFieldType;
    const valid: CustomFieldType[] = [
      "text",
      "long_text",
      "integer",
      "decimal",
      "boolean",
      "date",
      "datetime",
      "single_select",
      "multi_select",
      "url",
    ];
    const fieldType = valid.includes(type) ? type : "text";
    let allowedValues: string[] = [];
    if (fieldType === "single_select" || fieldType === "multi_select") {
      const options = window.prompt(t("columnOptions"), "");
      allowedValues = (options ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    }
    addColumn.mutate({ displayName: name, fieldType, allowedValues });
  };

  const isDocumentsView = view === "documents";
  const isTrashView = view === "trash";
  const fileEntry: MenuEntry[] = [
    ...(gridDoc
      ? [
          { key: "export-csv", label: t("exportCsv"), onSelect: () => runExport.mutate("csv") },
          { key: "export-docx", label: t("exportDocx"), onSelect: () => runExport.mutate("docx") },
          { key: "import-csv", label: t("importCsv"), onSelect: () => fileInput.current?.click() },
          { key: "sep1", label: "", separator: true },
        ]
      : []),
    { key: "docs", label: t("documents"), onSelect: () => setView("documents"), checked: isDocumentsView },
    { key: "trash", label: t("trash"), onSelect: () => setView("trash"), checked: isTrashView },
  ];

  const editEntries: MenuEntry[] = [
    { key: "add-heading", label: t("addHeading"), disabled: !gridDoc, onSelect: () => insertRow.mutate({ parentId: null, rowType: "heading" }) },
    { key: "add-requirement", label: t("addRequirement"), disabled: !gridDoc, onSelect: () => insertRow.mutate({ parentId: null, rowType: "requirement" }) },
    { key: "add-test-case", label: t("addTestCase"), disabled: !gridDoc, onSelect: () => insertRow.mutate({ parentId: null, rowType: "test_case" }) },
    {
      key: "add-test-step",
      label: t("addTestStep"),
      disabled: !gridDoc || !selectedRowId,
      onSelect: () => selectedRowId && insertRow.mutate({ parentId: selectedRowId, rowType: "test_step" }),
    },
    { key: "sep", label: "", separator: true },
    { key: "delete", label: t("deleteAction"), danger: true, disabled: !gridDoc || !selectedRowId, onSelect: () => selectedRowId && deleteRow.mutate(selectedRowId) },
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
    { key: "add-column", label: t("addColumn"), disabled: !gridDoc, onSelect: promptAddColumn },
  ];

  const columnEntries: MenuEntry[] = [...BUILTIN_COLUMNS, ...customColumns(fields)]
    .filter((c) => c.key !== "number")
    .map((column) => ({
      key: `col-${column.key}`,
      label: column.kind === "custom" ? column.labelKey : t(column.labelKey),
      checked: documentId ? !isHidden(documentId, column.key) : false,
      onSelect: () => documentId && toggleColumn(documentId, column.key),
    }));

  const analysisEntries: MenuEntry[] = [
    { key: "baselines", label: t("baselines"), onSelect: () => onOpenReport("baselines") },
    { key: "coverage", label: t("coverageReport"), onSelect: () => onOpenReport("coverage") },
  ];

  const helpEntries: MenuEntry[] = [
    { key: "about", label: t("about"), onSelect: () => pushToast("info", `${t("appName")} — ${t("aboutText")}`) },
  ];

  return (
    <div className="flex items-center gap-0.5 border-b border-border bg-surface px-2 py-1">
      <span className="px-2 text-sm font-semibold">{t("appName")}</span>
      <Menu testId="menu-file" label={t("menuFile")} entries={fileEntry} />
      <Menu testId="menu-edit" label={t("menuEdit")} entries={editEntries} />
      <Menu testId="menu-view" label={t("menuView")} entries={viewEntries} />
      <Menu testId="menu-insert" label={t("menuInsert")} entries={insertEntries} />
      {gridDoc && <Menu testId="menu-columns" label={t("menuColumns")} entries={columnEntries} />}
      {gridDoc && <Menu testId="menu-analysis" label={t("menuAnalysis")} entries={analysisEntries} />}
      <Menu testId="menu-help" label={t("menuHelp")} entries={helpEntries} />
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
    </div>
  );
}
