import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileDown, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useToastStore } from "../stores/toasts";

interface ExportBarProps {
  documentId: string;
}

interface ExportJob {
  id: string;
  status: string;
  ready: boolean;
}

async function pollExport(jobId: string): Promise<ExportJob> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await api<ExportJob>(`/exports/${jobId}`);
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("timeout");
}

export function ExportBar({ documentId }: ExportBarProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const runExport = useMutation({
    mutationFn: async (format: "csv" | "docx") => {
      setBusy(true);
      const created = await api<{ id: string }>(`/documents/${documentId}/exports`, {
        method: "POST",
        body: JSON.stringify({ format }),
      });
      const job = await pollExport(created.id);
      if (!job.ready) throw new Error("export failed");
      const { url } = await api<{ url: string }>(`/exports/${created.id}/download`);
      return url;
    },
    onSuccess: (url) => {
      window.open(url, "_blank");
      pushToast("success", t("exportReady"));
    },
    onError: () => pushToast("error", t("genericError")),
    onSettled: () => setBusy(false),
  });

  const importCsv = useMutation({
    mutationFn: async (csv: string) => api(`/documents/${documentId}/imports`, { method: "POST", body: JSON.stringify({ csv }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["outline", documentId] });
      pushToast("success", t("importCsv"));
    },
    onError: () => pushToast("error", t("genericError")),
  });

  return (
    <div className="flex items-center gap-1">
      <button
        data-testid="export-csv"
        disabled={busy}
        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        onClick={() => runExport.mutate("csv")}
      >
        <FileDown size={13} />
        {busy ? t("exporting") : t("exportCsv")}
      </button>
      <button
        data-testid="export-docx"
        disabled={busy}
        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        onClick={() => runExport.mutate("docx")}
      >
        <Download size={13} />
        {t("exportDocx")}
      </button>
      <button
        data-testid="import-csv"
        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs hover:bg-muted"
        onClick={() => fileInput.current?.click()}
      >
        <Upload size={13} />
        {t("importCsv")}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const text = await file.text();
          importCsv.mutate(text);
          event.target.value = "";
        }}
      />
    </div>
  );
}
