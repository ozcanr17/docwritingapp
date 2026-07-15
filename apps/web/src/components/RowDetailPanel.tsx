import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, MessageSquare, Paperclip, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, LinkCandidate, RowComment, RowDetail, TestExecution } from "../lib/api";
import { useSelectionStore } from "../stores/selection";
import { useToastStore } from "../stores/toasts";

interface RowDetailPanelProps {
  rowId: string;
  documentId: string;
  variant: "primary" | "linked";
}

const typeLabelKeys: Record<RowDetail["rowType"], string> = {
  heading: "typeHeading",
  requirement: "typeRequirement",
  test_case: "typeTestCase",
  test_step: "typeTestStep",
  note: "typeNote",
};

export function RowDetailPanel({ rowId, documentId, variant }: RowDetailPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const openLinked = useSelectionStore((s) => s.openLinked);
  const closeLinked = useSelectionStore((s) => s.closeLinked);
  const closeDetail = useSelectionStore((s) => s.closeDetail);
  const [description, setDescription] = useState("");
  const [linkTarget, setLinkTarget] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposedRowTitle, setProposedRowTitle] = useState("");

  const { data: row, isLoading } = useQuery({
    queryKey: ["row", rowId],
    queryFn: () => api<RowDetail>(`/rows/${rowId}`),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: linkCandidates = [], isFetching: isSearchingLinks } = useQuery({
    queryKey: ["link-candidates", documentId, linkTarget],
    queryFn: () =>
      api<LinkCandidate[]>(`/documents/${documentId}/link-candidates?q=${encodeURIComponent(linkTarget.trim())}`),
    enabled: linkTarget.trim().length >= 2,
  });
  const { data: comments = [] } = useQuery({
    queryKey: ["comments", rowId],
    queryFn: () => api<RowComment[]>(`/rows/${rowId}/comments`),
  });
  const { data: attachments = [] } = useQuery({
    queryKey: ["attachments", rowId],
    queryFn: () => api<Array<{ id: string; fileName: string; contentType: string; sizeBytes: number }>>(`/rows/${rowId}/attachments`),
  });
  const { data: executions = [] } = useQuery({
    queryKey: ["executions", rowId],
    queryFn: () => api<TestExecution[]>(`/rows/${rowId}/executions`),
    enabled: row?.rowType === "test_case",
  });
  const { data: proposals = [] } = useQuery({
    queryKey: ["proposals", rowId],
    queryFn: () => api<Array<{ id: string; title: string; status: string; reason: string | null }>>(`/rows/${rowId}/proposals`),
  });

  useEffect(() => {
    if (row) setDescription(row.description ?? "");
  }, [row]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "Escape" || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (document.querySelector("[data-testid=reports-dialog]")) return;
      if (variant === "linked") closeLinked();
      else closeDetail();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant, closeLinked, closeDetail]);

  const saveDescription = useMutation({
    mutationFn: (value: string) =>
      api<RowDetail>(`/rows/${rowId}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedVersion: row?.version, description: value }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["row", rowId] });
      void queryClient.invalidateQueries({ queryKey: ["outline", documentId] });
    },
    onError: (error) => {
      pushToast("error", error instanceof ApiError && error.status === 409 ? t("conflictError") : t("genericError"));
    },
  });

  const addLink = useMutation({
    mutationFn: (targetRowId: string) =>
      api(`/rows/${rowId}/links`, {
        method: "POST",
        body: JSON.stringify({ targetRowId, linkType: "verifies" }),
      }),
    onSuccess: () => {
      setLinkTarget("");
      void queryClient.invalidateQueries({ queryKey: ["row", rowId] });
      void queryClient.invalidateQueries({ queryKey: ["outline", documentId] });
    },
    onError: () => pushToast("error", t("genericError")),
  });

  const acknowledgeLink = useMutation({
    mutationFn: (linkId: string) => api(`/links/${linkId}/acknowledge`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["row", rowId] }),
    onError: () => pushToast("error", t("genericError")),
  });
  const addComment = useMutation({
    mutationFn: (body: string) => api(`/rows/${rowId}/comments`, { method: "POST", body: JSON.stringify({ body, mentionUserIds: [] }) }),
    onSuccess: () => {
      setCommentBody("");
      void queryClient.invalidateQueries({ queryKey: ["comments", rowId] });
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const createExecution = useMutation({
    mutationFn: () => api<TestExecution>(`/rows/${rowId}/executions`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["executions", rowId] }),
    onError: () => pushToast("error", t("genericError")),
  });
  const updateExecutionStep = useMutation({
    mutationFn: (input: { executionId: string; stepRowId: string; status: string }) =>
      api(`/executions/${input.executionId}/steps/${input.stepRowId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: input.status }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["executions", rowId] }),
    onError: () => pushToast("error", t("genericError")),
  });
  const completeExecution = useMutation({
    mutationFn: (executionId: string) => api(`/executions/${executionId}/complete`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["executions", rowId] }),
    onError: () => pushToast("error", t("genericError")),
  });
  const createProposal = useMutation({
    mutationFn: () => api(`/rows/${rowId}/proposals`, { method: "POST", body: JSON.stringify({ title: proposalTitle, proposedPatch: { title: proposedRowTitle }, submit: true }) }),
    onSuccess: () => { setProposalTitle(""); setProposedRowTitle(""); void queryClient.invalidateQueries({ queryKey: ["proposals", rowId] }); },
    onError: () => pushToast("error", t("genericError")),
  });

  const uploadAttachment = async (file: File) => {
    try {
      const created = await api<{ id: string; uploadUrl: string }>(`/rows/${rowId}/attachments`, {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size }),
      });
      const response = await fetch(created.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!response.ok) throw new Error("upload failed");
      await queryClient.invalidateQueries({ queryKey: ["attachments", rowId] });
    } catch {
      pushToast("error", t("genericError"));
    }
  };

  if (isLoading || !row) {
    return <div className="p-4 text-sm text-mutedForeground">{t("loading")}</div>;
  }

  const links = [...row.outgoingLinks, ...row.incomingLinks];

  return (
    <div className="flex h-full flex-col overflow-auto bg-surface" data-testid={`row-detail-${variant}`}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-mutedForeground">
          {variant === "linked" ? t("linkedView") : t("details")}
        </span>
        <button
          aria-label={variant === "linked" ? t("backToRow") : t("closePanel")}
          className="rounded p-1 text-mutedForeground hover:bg-muted"
          onClick={() => (variant === "linked" ? closeLinked() : closeDetail())}
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-4 p-4 text-sm">
        <div>
          <div className="mb-1 text-xs uppercase text-mutedForeground">{t("rowType")}</div>
          <span className="rounded bg-muted px-2 py-0.5 text-xs">{t(typeLabelKeys[row.rowType])}</span>
        </div>

        <div>
          <div className="mb-1 text-xs uppercase text-mutedForeground">{t("title")}</div>
          <div className="font-medium">{row.title || "—"}</div>
        </div>

        <label className="block">
          <div className="mb-1 text-xs uppercase text-mutedForeground">{t("description")}</div>
          <textarea
            data-testid="detail-description"
            className="min-h-24 w-full rounded border border-border bg-editorBackground px-2 py-1.5"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== (row.description ?? "")) saveDescription.mutate(description);
            }}
          />
        </label>

        {row.requirementDetail && (
          <div>
            <div className="mb-1 text-xs uppercase text-mutedForeground">{t("requirementNumber")}</div>
            <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
              {row.requirementDetail.requirementNo || "—"}
            </span>
          </div>
        )}

        {row.testCaseDetail && (
          <div>
            <div className="mb-1 text-xs uppercase text-mutedForeground">{t("status")}</div>
            <span className="rounded bg-info/15 px-2 py-0.5 text-xs text-info">{row.testCaseDetail.status}</span>
          </div>
        )}

        {row.testStepDetail && (
          <div className="space-y-3 rounded border border-border bg-editorBackground p-3">
            <DetailValue label={t("testStep")} value={row.testStepDetail.action} />
            <DetailValue label={t("expectedResult")} value={row.testStepDetail.expectedResult} />
            <DetailValue label={t("testResult")} value={row.testStepDetail.testResult} />
          </div>
        )}

        <div>
          <div className="mb-1 text-xs uppercase text-mutedForeground">{t("links")}</div>
          {links.length === 0 ? (
            <div className="text-xs text-mutedForeground">{t("noLinks")}</div>
          ) : (
            <ul className="space-y-1">
              {links.map((link) => {
                const otherId = link.sourceRowId === row.id ? link.targetRowId : link.sourceRowId;
                const other = link.sourceRowId === row.id ? link.targetRow : link.sourceRow;
                return (
                  <li key={link.id} className="rounded border border-border bg-editorBackground p-2">
                    <button
                      data-testid="open-linked"
                      className="flex w-full items-start gap-2 text-left text-primary hover:underline"
                      onClick={() => openLinked(otherId)}
                    >
                      <ExternalLink size={13} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {[other?.requirementDetail?.requirementNo, other?.title].filter(Boolean).join(" : ") || otherId.slice(0, 8)}
                        </span>
                        <span className="block truncate text-[10px] text-mutedForeground">
                          {other?.document.title} · {t(typeLabelKeys[other?.rowType ?? "note"])} · {link.linkType}
                        </span>
                      </span>
                    </button>
                    {link.suspect && (
                      <div className="mt-1 flex items-center gap-1">
                        <span
                          data-testid="suspect-badge"
                          className="flex items-center gap-0.5 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-warning"
                        >
                          <AlertTriangle size={10} />
                          {t("suspect")}
                        </span>
                        <button
                          data-testid="acknowledge-link"
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => acknowledgeLink.mutate(link.id)}
                        >
                          {t("acknowledge")}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <form
            className="mt-2 flex gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (linkTarget.trim()) addLink.mutate(linkTarget.trim());
            }}
          >
            <input
              data-testid="link-target"
              className="min-w-0 flex-1 rounded border border-border bg-editorBackground px-2 py-1 text-xs"
              placeholder={t("searchLinkTarget")}
              value={linkTarget}
              onChange={(e) => setLinkTarget(e.target.value)}
            />
            <button
              data-testid="link-add"
              type="submit"
              className="rounded bg-primary px-2 py-1 text-xs text-primaryForeground"
            >
              {t("add")}
            </button>
          </form>
          {linkTarget.trim().length >= 2 && (
            <div className="mt-1 max-h-52 overflow-auto rounded border border-border bg-editorBackground p-1">
              {isSearchingLinks ? (
                <div className="px-2 py-1 text-xs text-mutedForeground">{t("loading")}</div>
              ) : linkCandidates.filter((candidate) => candidate.id !== row.id).length === 0 ? (
                <div className="px-2 py-1 text-xs text-mutedForeground">{t("noLinkCandidates")}</div>
              ) : (
                linkCandidates
                  .filter((candidate) => candidate.id !== row.id)
                  .map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      data-testid="link-candidate"
                      className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                      onClick={() => addLink.mutate(candidate.id)}
                    >
                      <span className="block truncate text-xs font-medium">
                        {[candidate.requirementDetail?.requirementNo, candidate.title].filter(Boolean).join(" : ") || "—"}
                      </span>
                      <span className="block truncate text-[10px] text-mutedForeground">
                        {candidate.document.title} · {t(typeLabelKeys[candidate.rowType])}
                      </span>
                      {candidate.description && (
                        <span className="mt-0.5 block truncate text-[10px] text-mutedForeground">
                          {candidate.description}
                        </span>
                      )}
                    </button>
                  ))
              )}
            </div>
          )}
          <div className="mt-1 text-[10px] text-mutedForeground">{t("linkSearchHint")}</div>
        </div>

        <div>
          <div className="mb-2 text-xs uppercase text-mutedForeground">{t("changeProposals")}</div>
          <div className="space-y-1.5">
            {proposals.map((proposal) => <div key={proposal.id} className="flex items-center justify-between rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs"><span className="truncate">{proposal.title}</span><span className="rounded bg-muted px-1.5 py-0.5">{proposal.status}</span></div>)}
          </div>
          <form className="mt-2 space-y-1.5" onSubmit={(event) => { event.preventDefault(); if (proposalTitle.trim() && proposedRowTitle.trim()) createProposal.mutate(); }}>
            <input className="w-full rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs" value={proposalTitle} placeholder={t("proposalTitle")} onChange={(event) => setProposalTitle(event.target.value)} />
            <input className="w-full rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs" value={proposedRowTitle} placeholder={t("proposedTitle")} onChange={(event) => setProposedRowTitle(event.target.value)} />
            <button className="w-full rounded-lg border border-primary px-2 py-1.5 text-xs text-primary" disabled={!proposalTitle.trim() || !proposedRowTitle.trim()}>{t("submitProposal")}</button>
          </form>
        </div>

        {row.rowType === "test_case" && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs uppercase text-mutedForeground"><Play size={13} />{t("testExecutions")}</div>
              <button data-testid="start-execution" className="rounded-lg bg-primary px-2 py-1 text-xs text-primaryForeground" onClick={() => createExecution.mutate()}>{t("startExecution")}</button>
            </div>
            {executions.length === 0 ? (
              <div className="text-xs text-mutedForeground">{t("noExecutions")}</div>
            ) : executions.map((execution) => (
              <div key={execution.id} className="mb-2 rounded-lg border border-border bg-editorBackground p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{execution.status}</span>
                  <span className="text-mutedForeground">{new Date(execution.createdAt).toLocaleString()}</span>
                </div>
                {execution.status === "running" && (
                  <div className="mt-2 space-y-1.5">
                    {execution.steps.map((step) => (
                      <label key={step.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">{step.testStepRow.title || step.testStepRow.testStepDetail?.action || "—"}</span>
                        <select
                          data-testid={`execution-step-${step.testStepRow.id}`}
                          className="rounded border border-border bg-surface px-1.5 py-1"
                          value={step.status}
                          onChange={(event) => updateExecutionStep.mutate({ executionId: execution.id, stepRowId: step.testStepRow.id, status: event.target.value })}
                        >
                          <option value="not_run">{t("notRun")}</option>
                          <option value="passed">{t("passed")}</option>
                          <option value="failed">{t("failed")}</option>
                          <option value="blocked">{t("blocked")}</option>
                          <option value="skipped">{t("skipped")}</option>
                        </select>
                      </label>
                    ))}
                    <button className="mt-1 w-full rounded bg-primary px-2 py-1 text-xs text-primaryForeground" onClick={() => completeExecution.mutate(execution.id)}>{t("completeExecution")}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs uppercase text-mutedForeground"><Paperclip size={13} />{t("attachments")}</div>
          <div className="space-y-1">
            {attachments.map((attachment) => (
              <button
                key={attachment.id}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={async () => {
                  const result = await api<{ url: string }>(`/attachments/${attachment.id}/download`);
                  window.open(result.url, "_blank");
                }}
              >
                <span className="truncate">{attachment.fileName}</span>
                <span className="text-mutedForeground">{Math.ceil(attachment.sizeBytes / 1024)} KB</span>
              </button>
            ))}
          </div>
          <label className="mt-2 block cursor-pointer rounded-lg border border-dashed border-border px-2 py-2 text-center text-xs text-mutedForeground hover:bg-muted">
            {t("uploadAttachment")}
            <input
              data-testid="attachment-input"
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadAttachment(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs uppercase text-mutedForeground"><MessageSquare size={13} />{t("comments")}</div>
          <div className="max-h-52 space-y-2 overflow-auto">
            {comments.map((comment) => (
              <div key={comment.id} className={`rounded-lg border border-border p-2 ${comment.resolvedAt ? "opacity-60" : "bg-editorBackground"}`}>
                <div className="flex items-center justify-between text-[10px] text-mutedForeground">
                  <span>{comment.author.displayName}</span>
                  <span>{new Date(comment.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap text-xs">{comment.body}</div>
              </div>
            ))}
          </div>
          <form
            className="mt-2 flex gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (commentBody.trim()) addComment.mutate(commentBody.trim());
            }}
          >
            <input data-testid="comment-input" className="min-w-0 flex-1 rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs" value={commentBody} placeholder={t("addComment")} onChange={(event) => setCommentBody(event.target.value)} />
            <button className="rounded-lg bg-primary px-2 py-1 text-xs text-primaryForeground">{t("add")}</button>
          </form>
        </div>

        {row.rowProjects.length > 0 && (
          <div>
            <div className="mb-1 text-xs uppercase text-mutedForeground">{t("projects")}</div>
            <div className="flex flex-wrap gap-1">
              {row.rowProjects.map((rp) => (
                <span key={rp.id} className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {rp.projectId.slice(0, 8)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailValue({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase text-mutedForeground">{label}</div>
      <div className="whitespace-pre-wrap text-sm">{value || "—"}</div>
    </div>
  );
}
