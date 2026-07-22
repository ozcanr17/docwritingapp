import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bug,
  ExternalLink,
  FileText,
  Paperclip,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, TestExecution } from "../lib/api";
import { useToastStore } from "../stores/toasts";

type Step = TestExecution["steps"][number];

export function ExecutionStepCard({
  executionId,
  step,
  editable,
  onChanged,
}: {
  executionId: string;
  step: Step;
  editable: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const pushToast = useToastStore((state) => state.push);
  const [actualResult, setActualResult] = useState(step.actualResult ?? "");
  const [defectReference, setDefectReference] = useState("");
  const [defectSummary, setDefectSummary] = useState("");
  const [defectUrl, setDefectUrl] = useState("");
  const [internalDefectTitle, setInternalDefectTitle] = useState("");
  const [defectProjectId, setDefectProjectId] = useState("");
  const projects = useQuery({
    queryKey: ["execution-defect-projects", executionId],
    queryFn: () =>
      api<Array<{ id: string; name: string; code: string }>>(
        `/executions/${executionId}/defect-projects`,
      ),
    enabled: editable && step.status === "failed",
  });
  useEffect(
    () => setActualResult(step.actualResult ?? ""),
    [step.actualResult],
  );
  useEffect(() => {
    if (!defectProjectId && projects.data?.[0])
      setDefectProjectId(projects.data[0].id);
  }, [defectProjectId, projects.data]);

  const update = useMutation({
    mutationFn: (input: { status: string; actualResult: string }) =>
      api(`/executions/${executionId}/steps/${step.testStepRow.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: onChanged,
    onError: () => pushToast("error", t("genericError")),
  });
  const addEvidence = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api(`/executions/${executionId}/steps/${step.testStepRow.id}/evidence`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setDefectReference("");
      setDefectSummary("");
      setDefectUrl("");
      onChanged();
      pushToast("success", t("evidenceAdded"));
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const removeEvidence = useMutation({
    mutationFn: (evidenceId: string) =>
      api(
        `/executions/${executionId}/steps/${step.testStepRow.id}/evidence/${evidenceId}`,
        { method: "DELETE" },
      ),
    onSuccess: onChanged,
    onError: () => pushToast("error", t("genericError")),
  });
  const createInternalDefect = useMutation({
    mutationFn: () =>
      api<{ key: string }>(
        `/executions/${executionId}/steps/${step.testStepRow.id}/internal-defect`,
        {
          method: "POST",
          body: JSON.stringify({
            projectId: defectProjectId,
            title: internalDefectTitle,
            priority: "high",
          }),
        },
      ),
    onSuccess: (created) => {
      setInternalDefectTitle("");
      onChanged();
      pushToast(
        "success",
        `${t("workHub.internalDefectCreated")}: ${created.key}`,
      );
    },
    onError: () => pushToast("error", t("genericError")),
  });

  const uploadEvidence = async (file: File) => {
    try {
      const contentType = file.type || "application/octet-stream";
      const created = await api<{ id: string; uploadUrl: string }>(
        `/rows/${step.testStepRow.id}/attachments`,
        {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            contentType,
            sizeBytes: file.size,
          }),
        },
      );
      const response = await fetch(created.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });
      if (!response.ok) throw new Error("upload failed");
      await api(`/attachments/${created.id}/complete`, { method: "POST" });
      await addEvidence.mutateAsync({
        kind: "attachment",
        attachmentId: created.id,
      });
    } catch {
      pushToast("error", t("genericError"));
    }
  };

  const label =
    step.testStepRow.title ||
    step.testStepRow.testStepDetail?.action ||
    t("untitled");
  return (
    <div
      data-testid={`execution-step-card-${step.testStepRow.id}`}
      className="rounded-lg border border-border bg-surface p-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {label}
        </span>
        <select
          data-testid={`execution-step-${step.testStepRow.id}`}
          disabled={!editable}
          className="rounded border border-border bg-surface px-1.5 py-1 text-xs disabled:opacity-70"
          value={step.status}
          onChange={(event) =>
            update.mutate({ status: event.target.value, actualResult })
          }
        >
          <option value="not_run">{t("notRun")}</option>
          <option value="passed">{t("passed")}</option>
          <option value="failed">{t("failed")}</option>
          <option value="blocked">{t("blocked")}</option>
          <option value="skipped">{t("skipped")}</option>
        </select>
      </div>
      <div className="mt-2 flex gap-1">
        <textarea
          data-testid={`actual-result-${step.testStepRow.id}`}
          readOnly={!editable}
          className="min-h-16 min-w-0 flex-1 resize-y rounded border border-border bg-editorBackground px-2 py-1 text-xs read-only:text-mutedForeground"
          value={actualResult}
          onChange={(event) => setActualResult(event.target.value)}
          placeholder={t("actualResult")}
        />
        {editable && (
          <button
            data-testid={`save-actual-result-${step.testStepRow.id}`}
            className="self-start rounded border border-border p-1.5 text-mutedForeground hover:bg-muted"
            title={t("saveActualResult")}
            onClick={() => update.mutate({ status: step.status, actualResult })}
          >
            <Save size={13} />
          </button>
        )}
      </div>
      <details className="mt-2 rounded border border-border bg-editorBackground p-2">
        <summary
          data-testid={`evidence-toggle-${step.testStepRow.id}`}
          className="cursor-pointer text-xs font-medium"
        >
          {t("testEvidence")} ({step.evidence.length})
        </summary>
        <div className="mt-2 space-y-1.5">
          {step.evidence.length === 0 && (
            <div className="text-[11px] text-mutedForeground">
              {t("noEvidence")}
            </div>
          )}
          {step.evidence.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5 text-xs"
            >
              {item.kind === "attachment" ? (
                <FileText size={13} />
              ) : (
                <Bug size={13} />
              )}
              <button
                className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={async () => {
                  if (item.kind === "attachment" && item.attachmentId) {
                    const result = await api<{ url: string }>(
                      `/attachments/${item.attachmentId}/download`,
                    );
                    window.open(result.url, "_blank", "noopener,noreferrer");
                  } else if (item.url)
                    window.open(item.url, "_blank", "noopener,noreferrer");
                }}
              >
                {item.kind === "attachment"
                  ? item.fileName
                  : [item.reference, item.summary].filter(Boolean).join(" - ")}
              </button>
              {item.url && (
                <ExternalLink size={11} className="text-mutedForeground" />
              )}
              {editable && (
                <button
                  aria-label={t("removeEvidence")}
                  className="text-mutedForeground hover:text-destructive"
                  onClick={() => removeEvidence.mutate(item.id)}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <>
              <label className="flex cursor-pointer items-center justify-center gap-1 rounded border border-dashed border-border px-2 py-1.5 text-[11px] text-mutedForeground hover:bg-muted">
                <Paperclip size={12} />
                {t("addEvidenceFile")}
                <input
                  data-testid={`evidence-file-${step.testStepRow.id}`}
                  type="file"
                  className="hidden"
                  accept="image/*,.log,.txt,.pdf,.json,.xml,.zip"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadEvidence(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <div className="grid gap-1 sm:grid-cols-2">
                <input
                  data-testid={`defect-reference-${step.testStepRow.id}`}
                  className="rounded border border-border bg-surface px-2 py-1 text-xs"
                  value={defectReference}
                  onChange={(event) => setDefectReference(event.target.value)}
                  placeholder={t("defectReference")}
                />
                <input
                  data-testid={`defect-url-${step.testStepRow.id}`}
                  className="rounded border border-border bg-surface px-2 py-1 text-xs"
                  value={defectUrl}
                  onChange={(event) => setDefectUrl(event.target.value)}
                  placeholder={t("defectUrl")}
                />
                <input
                  data-testid={`defect-summary-${step.testStepRow.id}`}
                  className="rounded border border-border bg-surface px-2 py-1 text-xs sm:col-span-2"
                  value={defectSummary}
                  onChange={(event) => setDefectSummary(event.target.value)}
                  placeholder={t("defectSummary")}
                />
              </div>
              <button
                data-testid={`add-defect-${step.testStepRow.id}`}
                className="w-full rounded border border-primary px-2 py-1 text-xs text-primary disabled:opacity-50"
                disabled={!defectReference.trim() || addEvidence.isPending}
                onClick={() =>
                  addEvidence.mutate({
                    kind: "defect",
                    reference: defectReference.trim(),
                    summary: defectSummary.trim() || undefined,
                    url: defectUrl.trim() || undefined,
                  })
                }
              >
                {t("linkDefect")}
              </button>
              {step.status === "failed" &&
                projects.data &&
                projects.data.length > 0 && (
                  <div className="space-y-1 rounded border border-danger/30 bg-danger/5 p-2">
                    <div className="text-[11px] font-semibold text-danger">
                      {t("workHub.createInternalDefect")}
                    </div>
                    <select
                      value={defectProjectId}
                      onChange={(event) =>
                        setDefectProjectId(event.target.value)
                      }
                      className="w-full rounded border border-border bg-surface px-2 py-1 text-xs"
                      aria-label={t("workHub.defectProject")}
                    >
                      {projects.data.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.code} - {project.name}
                        </option>
                      ))}
                    </select>
                    <input
                      data-testid={`internal-defect-title-${step.testStepRow.id}`}
                      value={internalDefectTitle}
                      onChange={(event) =>
                        setInternalDefectTitle(event.target.value)
                      }
                      className="w-full rounded border border-border bg-surface px-2 py-1 text-xs"
                      placeholder={t("workHub.internalDefectTitle")}
                    />
                    <button
                      data-testid={`create-internal-defect-${step.testStepRow.id}`}
                      type="button"
                      className="w-full rounded bg-danger px-2 py-1 text-xs text-white disabled:opacity-50"
                      disabled={
                        !defectProjectId ||
                        !internalDefectTitle.trim() ||
                        createInternalDefect.isPending
                      }
                      onClick={() => createInternalDefect.mutate()}
                    >
                      {t("workHub.createInternalDefect")}
                    </button>
                  </div>
                )}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
