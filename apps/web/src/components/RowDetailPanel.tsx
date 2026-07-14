import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, RowDetail } from "../lib/api";
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
  const setRow = useSelectionStore((s) => s.setRow);
  const [description, setDescription] = useState("");
  const [linkTarget, setLinkTarget] = useState("");

  const { data: row, isLoading } = useQuery({
    queryKey: ["row", rowId],
    queryFn: () => api<RowDetail>(`/rows/${rowId}`),
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (row) setDescription(row.description ?? "");
  }, [row]);

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
    },
    onError: () => pushToast("error", t("genericError")),
  });

  const acknowledgeLink = useMutation({
    mutationFn: (linkId: string) => api(`/links/${linkId}/acknowledge`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["row", rowId] }),
    onError: () => pushToast("error", t("genericError")),
  });

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
          onClick={() => (variant === "linked" ? closeLinked() : setRow(null))}
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
            <div className="mb-1 text-xs uppercase text-mutedForeground">{t("status")}</div>
            <span className="rounded bg-info/15 px-2 py-0.5 text-xs text-info">{row.requirementDetail.status}</span>
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
                return (
                  <li key={link.id} className="flex items-center gap-1">
                    <button
                      data-testid="open-linked"
                      className="flex items-center gap-1 text-primary hover:underline"
                      onClick={() => openLinked(otherId)}
                    >
                      <ExternalLink size={13} />
                      <span className="font-mono text-xs">{otherId.slice(0, 8)}</span>
                      <span className="text-xs text-mutedForeground">({link.linkType})</span>
                    </button>
                    {link.suspect && (
                      <>
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
                      </>
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
              placeholder={t("targetRowId")}
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
