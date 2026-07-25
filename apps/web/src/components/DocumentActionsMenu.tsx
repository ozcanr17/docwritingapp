import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, CustomFieldType, DocumentType, FieldDefinition } from "../lib/api";
import { columnsForDocument } from "../lib/columns";
import { storedLanguage } from "../lib/i18n";
import { useColumnStore } from "../stores/columns";
import { useSelectionStore } from "../stores/selection";
import { useToastStore } from "../stores/toasts";
import { Menu, MenuEntry } from "./Menu";
import { AddColumnDialog } from "./AddColumnDialog";

const MigrationWizard = lazy(() => import("./MigrationWizard").then((module) => ({ default: module.MigrationWizard })));

interface DocumentActionsMenuProps {
  documentId: string;
  documentType: DocumentType | null;
  canManageAccess: boolean;
  onOpenReport: (tab: "readiness" | "baselines" | "coverage" | "matrix" | "reviews" | "runs") => void;
  onOpenHistory: (mode: "row" | "document") => void;
  onOpenAccess: () => void;
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

export function DocumentActionsMenu({ documentId, documentType, canManageAccess, onOpenReport, onOpenHistory, onOpenAccess }: DocumentActionsMenuProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const selectedRowId = useSelectionStore((s) => s.selectedRowId);
  const hiddenByDocument = useColumnStore((s) => s.hidden);
  const hiddenColumns = hiddenByDocument[documentId] ?? [];
  const toggleColumn = useColumnStore((s) => s.toggle);
  const fileInput = useRef<HTMLInputElement>(null);
  const reqifInput = useRef<HTMLInputElement>(null);
  const xlsxInput = useRef<HTMLInputElement>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [migrationFile, setMigrationFile] = useState<{ format: "csv" | "xlsx" | "reqif"; fileName: string; content: string } | null>(null);

  const gridDoc = documentType === "requirement" || documentType === "test";

  const { data: fields = [] } = useQuery({
    queryKey: ["fields", documentId],
    queryFn: () => api<FieldDefinition[]>(`/documents/${documentId}/fields`),
    enabled: gridDoc,
  });

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

  const columnEntries: MenuEntry[] = (documentType === "requirement" || documentType === "test"
    ? columnsForDocument(documentType, fields)
    : [])
    .filter((c) => c.key !== "number")
    .map((column) => ({
      key: `col-${column.key}`,
      label: column.kind === "custom" ? column.labelKey : t(column.labelKey),
      checked: !hiddenColumns.includes(column.key),
      onSelect: () => toggleColumn(documentId, column.key),
    }));

  const entries: MenuEntry[] = [
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
          { key: "import-sep", label: "", separator: true },
          {
            key: "analysis",
            label: t("menuAnalysis"),
            children: [
              { key: "readiness", label: t("releaseReadiness"), onSelect: () => onOpenReport("readiness") },
              { key: "coverage", label: t("coverageReport"), onSelect: () => onOpenReport("coverage") },
              { key: "matrix", label: t("traceabilityMatrix"), onSelect: () => onOpenReport("matrix") },
              { key: "reviews", label: t("reviews"), onSelect: () => onOpenReport("reviews") },
              { key: "runs", label: t("testRuns"), onSelect: () => onOpenReport("runs") },
            ],
          },
          { key: "analysis-sep", label: "", separator: true },
          { key: "selected-row-history", label: t("selectedRowHistory"), disabled: !selectedRowId, onSelect: () => onOpenHistory("row") },
          { key: "document-history", label: t("documentHistory"), onSelect: () => onOpenHistory("document") },
          { key: "history-sep", label: "", separator: true },
          {
            key: "insert",
            label: t("menuInsert"),
            children: [{ key: "add-column", label: t("addColumn"), onSelect: () => setAddColumnOpen(true) }],
          },
          { key: "columns", label: t("menuColumns"), children: columnEntries },
        ]
      : []),
    ...(canManageAccess
      ? [
          { key: "access-sep", label: "", separator: true },
          { key: "permissions", label: t("documentPermissions"), onSelect: onOpenAccess },
        ]
      : []),
  ];

  if (entries.length === 0) return null;

  return (
    <>
      <Menu testId="document-actions" label={t("documentActions")} icon={<MoreHorizontal size={17} />} entries={entries} />
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        data-testid="menubar-file-input"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setMigrationFile({ format: "csv", fileName: file.name, content: await file.text() });
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
          setMigrationFile({ format: "xlsx", fileName: file.name, content: btoa(binary) });
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
          setMigrationFile({ format: "reqif", fileName: file.name, content: await file.text() });
          event.target.value = "";
        }}
      />
      {addColumnOpen && (
        <AddColumnDialog
          onClose={() => setAddColumnOpen(false)}
          onSubmit={(input) => addColumn.mutate(input)}
        />
      )}
      {migrationFile && <Suspense fallback={null}><MigrationWizard documentId={documentId} {...migrationFile} onClose={() => setMigrationFile(null)} onImported={async () => { await invalidateOutline(); pushToast("success", t("importCompleted")); }} /></Suspense>}
    </>
  );
}
