import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, AtSign, ExternalLink, MessageSquare, Paperclip, PencilLine, Play, Quote, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, LinkCandidate, RowComment, RowDetail, TestExecution } from "../lib/api";
import { useSelectionStore } from "../stores/selection";
import { useDocumentTabsStore } from "../stores/documentTabs";
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

function apiErrorDetail(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.payload || typeof error.payload !== "object") return null;
  const payload = error.payload as { message?: unknown; issues?: unknown };
  if (Array.isArray(payload.message)) return payload.message.filter((value): value is string => typeof value === "string").join(" · ");
  if (typeof payload.message === "string" && payload.message !== "Validation failed") return payload.message;
  if (Array.isArray(payload.issues)) return payload.issues.filter((value): value is string => typeof value === "string").join(" · ");
  return null;
}

export function RowDetailPanel({ rowId, documentId, variant }: RowDetailPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const openLinked = useSelectionStore((s) => s.openLinked);
  const openDocumentTab = useDocumentTabsStore((s) => s.open);
  const closeLinked = useSelectionStore((s) => s.closeLinked);
  const closeDetail = useSelectionStore((s) => s.closeDetail);
  const [description, setDescription] = useState("");
  const [linkTarget, setLinkTarget] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [mentionedPeople, setMentionedPeople] = useState<Array<{ id: string; displayName: string; email: string }>>([]);
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposedRowTitle, setProposedRowTitle] = useState("");
  const [commentAnchor, setCommentAnchor] = useState<{ field: "title" | "description"; start: number; end: number; quotedText: string } | null>(null);
  const [suggestionMode, setSuggestionMode] = useState(false);
  const [suggestedReplacement, setSuggestedReplacement] = useState("");

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
    enabled: row?.document.documentType === "test" && (row.rowType === "test_case" || row.rowType === "heading"),
  });
  const { data: proposals = [] } = useQuery({
    queryKey: ["proposals", rowId],
    queryFn: () => api<Array<{ id: string; title: string; status: string; reason: string | null }>>(`/rows/${rowId}/proposals`),
  });
  const { data: people = [] } = useQuery({
    queryKey: ["row-people", rowId, peopleQuery],
    queryFn: () => api<Array<{ id: string; displayName: string; email: string; department: string | null }>>(`/rows/${rowId}/people?q=${encodeURIComponent(peopleQuery.trim())}`),
    enabled: peopleOpen || row?.rowType === "test_case",
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
    mutationFn: (input: { body: string; anchor: typeof commentAnchor; suggestedReplacement?: string }) => api(`/rows/${rowId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: input.body, mentionUserIds: mentionedPeople.map((person) => person.id), anchor: input.anchor ?? undefined, suggestedReplacement: input.suggestedReplacement }),
    }),
    onSuccess: () => {
      setCommentBody("");
      setMentionedPeople([]);
      setPeopleOpen(false);
      setCommentAnchor(null);
      setSuggestionMode(false);
      setSuggestedReplacement("");
      void queryClient.invalidateQueries({ queryKey: ["comments", rowId] });
      void queryClient.invalidateQueries({ queryKey: ["proposals", rowId] });
      pushToast("success", t("commentAdded"));
    },
    onError: (error) => pushToast("error", apiErrorDetail(error) ?? t("commentAddFailed")),
  });
  const assignTest = useMutation({
    mutationFn: (assigneeId: string | null) => api(`/rows/${rowId}`, { method: "PATCH", body: JSON.stringify({ expectedVersion: row?.version, testCaseDetail: { assigneeId } }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["row", rowId] });
      void queryClient.invalidateQueries({ queryKey: ["outline", documentId] });
      pushToast("success", t("assignmentUpdated"));
    },
    onError: () => pushToast("error", t("genericError")),
  });
  const createExecution = useMutation({
    mutationFn: () => api<TestExecution>(`/rows/${rowId}/executions`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["executions", rowId] });
      pushToast("success", t("executionStarted"));
    },
    onError: (error) => pushToast("error", apiErrorDetail(error) ?? t("executionStartFailed")),
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
  const stopExecution = useMutation({
    mutationFn: (executionId: string) => api(`/executions/${executionId}/stop`, { method: "POST" }),
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
      await api(`/attachments/${created.id}/complete`, { method: "POST" });
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
          <div className="flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">ID {row.objectNumber}</span>
            <span className="rounded bg-muted px-2 py-0.5 text-xs">{t(typeLabelKeys[row.rowType])}</span>
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs uppercase text-mutedForeground">{t("title")}</div>
          <div
            className="cursor-text select-text rounded px-1 py-0.5 font-medium hover:bg-primary/5"
            title={t("selectionCommentHelp")}
            onMouseUp={(event) => {
              const selection = window.getSelection();
              if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return;
              if (!event.currentTarget.contains(selection.anchorNode) || !event.currentTarget.contains(selection.focusNode)) return;
              const start = Math.min(selection.anchorOffset, selection.focusOffset);
              const end = Math.max(selection.anchorOffset, selection.focusOffset);
              const quotedText = row.title.slice(start, end);
              if (quotedText) setCommentAnchor({ field: "title", start, end, quotedText });
            }}
          >{row.title || "—"}</div>
        </div>

        <label className="block">
          <div className="mb-1 text-xs uppercase text-mutedForeground">{t("description")}</div>
          <textarea
            data-testid="detail-description"
            className="min-h-24 w-full rounded border border-border bg-editorBackground px-2 py-1.5"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onSelect={(event) => {
              const target = event.currentTarget;
              if (target.selectionEnd > target.selectionStart) {
                setCommentAnchor({ field: "description", start: target.selectionStart, end: target.selectionEnd, quotedText: target.value.slice(target.selectionStart, target.selectionEnd) });
              }
            }}
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
          <div className="grid grid-cols-2 gap-3">
            <div><div className="mb-1 text-xs uppercase text-mutedForeground">{t("status")}</div><span className="rounded bg-info/15 px-2 py-0.5 text-xs text-info">{row.testCaseDetail.status}</span></div>
            <label><div className="mb-1 text-xs uppercase text-mutedForeground">{t("assignee")}</div><select className="w-full rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs" value={row.testCaseDetail.assigneeId ?? ""} onChange={(event) => assignTest.mutate(event.target.value || null)} disabled={assignTest.isPending}><option value="">{t("unassigned")}</option>{people.map((person) => <option key={person.id} value={person.id}>{person.displayName} · {person.email}</option>)}</select></label>
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
                      onClick={() => {
                        if (!other) return;
                        openDocumentTab({ id: other.document.id, title: other.document.title, documentType: other.document.documentType });
                        useSelectionStore.getState().setDocument(other.document.id);
                        window.setTimeout(() => useSelectionStore.getState().openDetail(otherId), 0);
                      }}
                    >
                      <ExternalLink size={13} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {other?.rowType === "requirement" ? other.requirementDetail?.requirementNo || `ID ${otherId.slice(0, 8)}` : other?.title || otherId.slice(0, 8)}
                        </span>
                        <span className="block truncate text-[10px] text-mutedForeground">
                          {other?.document.title} · {t(typeLabelKeys[other?.rowType ?? "note"])} · {link.linkType}
                        </span>
                      </span>
                    </button>
                    <button className="mt-1 text-[10px] text-mutedForeground hover:text-foreground hover:underline" onClick={() => openLinked(otherId)}>{t("quickPreview")}</button>
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

        {row.document.documentType === "test" && (row.rowType === "test_case" || row.rowType === "heading") && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs uppercase text-mutedForeground"><Play size={13} />{t("testExecutions")}</div>
              <button
                data-testid="start-execution"
                className="rounded-lg bg-primary px-2 py-1 text-xs text-primaryForeground disabled:cursor-wait disabled:opacity-60"
                disabled={createExecution.isPending}
                onClick={() => createExecution.mutate()}
              >
                {t("startExecution")}
              </button>
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
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <button className="rounded bg-primary px-2 py-1 text-xs text-primaryForeground" onClick={() => completeExecution.mutate(execution.id)}>{t("completeExecution")}</button>
                      <button className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive" onClick={() => stopExecution.mutate(execution.id)}>{t("stopRun")}</button>
                    </div>
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
                  <button className="hover:text-foreground hover:underline" onClick={() => window.dispatchEvent(new CustomEvent("docsys:open-profile", { detail: { userId: comment.author.id } }))}>{comment.author.displayName}</button>
                  <span>{new Date(comment.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap text-xs">{comment.body}</div>
                {comment.anchor?.quotedText && (
                  <div className="mt-2 rounded-md border-l-2 border-primary bg-primary/5 px-2 py-1.5 text-[11px]">
                    <div className="mb-1 flex items-center gap-1 font-medium text-primary"><Quote size={11} />{t("selectedPassage")} · {comment.anchor.field}</div>
                    <div className="whitespace-pre-wrap text-mutedForeground">{comment.anchor.quotedText}</div>
                    {comment.suggestedReplacement !== null && (
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                        <div className="rounded bg-destructive/10 p-1"><span className="block text-[9px] uppercase text-destructive">{t("originalText")}</span>{comment.anchor.quotedText}</div>
                        <div className="rounded bg-success/10 p-1"><span className="block text-[9px] uppercase text-success">{t("replacementText")}</span>{comment.suggestedReplacement}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {commentAnchor && (
            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-medium text-primary"><Quote size={12} />{t("selectedPassage")} · {commentAnchor.field}</span>
                <button type="button" aria-label={t("clearSelectionAnchor")} className="rounded p-0.5 hover:bg-muted" onClick={() => { setCommentAnchor(null); setSuggestionMode(false); }}><X size={12} /></button>
              </div>
              <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-mutedForeground">{commentAnchor.quotedText}</div>
              <label className="mt-2 flex cursor-pointer items-center gap-2"><input type="checkbox" className="accent-primary" checked={suggestionMode} onChange={(event) => setSuggestionMode(event.target.checked)} /><PencilLine size={12} />{t("suggestChange")}</label>
              {suggestionMode && <textarea className="mt-2 min-h-16 w-full rounded-lg border border-border bg-editorBackground px-2 py-1.5" value={suggestedReplacement} placeholder={t("suggestedReplacement")} onChange={(event) => setSuggestedReplacement(event.target.value)} />}
            </div>
          )}
          <form
            className="relative mt-2 flex items-end gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (commentBody.trim()) addComment.mutate({ body: commentBody.trim(), anchor: commentAnchor, ...(suggestionMode ? { suggestedReplacement } : {}) });
            }}
          >
            <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap gap-1">{mentionedPeople.map((person) => <button key={person.id} type="button" className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary" onClick={() => setMentionedPeople((current) => current.filter((candidate) => candidate.id !== person.id))}>@{person.displayName} ×</button>)}</div><textarea data-testid="comment-input" className="min-h-16 w-full rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs" value={commentBody} placeholder={commentAnchor ? t("commentOnSelection") : t("addComment")} onChange={(event) => { setCommentBody(event.target.value); if (event.target.value.endsWith("@")) setPeopleOpen(true); }} /></div>
            <button type="button" aria-label={t("mentionUser")} title={t("mentionUser")} className="rounded-lg border border-border p-1.5 text-mutedForeground hover:bg-muted" onClick={() => setPeopleOpen((current) => !current)}><AtSign size={14} /></button>
            <button
              className="rounded-lg bg-primary px-2 py-1 text-xs text-primaryForeground disabled:cursor-wait disabled:opacity-60"
              disabled={!commentBody.trim() || addComment.isPending || (suggestionMode && !commentAnchor)}
            >
              {t("add")}
            </button>
            {peopleOpen && <div className="absolute bottom-full right-0 z-30 mb-1 w-72 rounded-xl border border-border bg-surfaceElevated p-2 shadow-2xl"><input autoFocus className="mb-2 w-full rounded-lg border border-border bg-editorBackground px-2 py-1.5 text-xs" value={peopleQuery} placeholder={t("searchPeople")} onChange={(event) => setPeopleQuery(event.target.value)} /><div className="max-h-44 overflow-auto">{people.map((person) => <button key={person.id} type="button" className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => { setMentionedPeople((current) => current.some((candidate) => candidate.id === person.id) ? current : [...current, person]); setCommentBody((current) => `${current.replace(/@$/, "")}@${person.displayName} `); setPeopleOpen(false); }}><span className="block font-medium">{person.displayName}</span><span className="block truncate text-[10px] text-mutedForeground">{person.email}{person.department ? ` · ${person.department}` : ""}</span></button>)}</div></div>}
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
