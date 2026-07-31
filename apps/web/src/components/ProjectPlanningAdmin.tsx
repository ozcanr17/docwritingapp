import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, IterationStatus, ProjectIteration, ProjectRelease, ReleaseStatus } from "../lib/api";
import { userFacingError } from "../lib/userFacingError";
import { useToastStore } from "../stores/toasts";
import { Button, Card, CardBody, CardHeader, Lozenge, LozengeAppearance, ProgressBar, TableHead } from "./ui";

const RELEASE_STATUSES: ReleaseStatus[] = ["planned", "active", "released"];
const ITERATION_STATUSES: IterationStatus[] = ["planned", "active", "completed"];

const releaseAppearance: Record<ReleaseStatus, LozengeAppearance> = {
  planned: "neutral",
  active: "primary",
  released: "success",
};
const iterationAppearance: Record<IterationStatus, LozengeAppearance> = {
  planned: "neutral",
  active: "primary",
  completed: "success",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

export function ProjectPlanningAdmin({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((state) => state.push);
  const [releaseName, setReleaseName] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [iterationName, setIterationName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const releases = useQuery({
    queryKey: ["project-releases", projectId],
    queryFn: () => api<ProjectRelease[]>(`/projects/${projectId}/releases`),
  });
  const iterations = useQuery({
    queryKey: ["project-iterations", projectId],
    queryFn: () => api<ProjectIteration[]>(`/projects/${projectId}/iterations`),
  });
  const invalidateReleases = () => queryClient.invalidateQueries({ queryKey: ["project-releases", projectId] });
  const invalidateIterations = () => queryClient.invalidateQueries({ queryKey: ["project-iterations", projectId] });
  const fail = (error: unknown) => pushToast("error", userFacingError(error, t));

  const createRelease = useMutation({
    mutationFn: () => api(`/projects/${projectId}/releases`, {
      method: "POST",
      body: JSON.stringify({ name: releaseName.trim(), releaseDate: releaseDate || null }),
    }),
    onSuccess: async () => { setReleaseName(""); setReleaseDate(""); await invalidateReleases(); },
    onError: fail,
  });
  const updateRelease = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReleaseStatus }) => api(`/releases/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: invalidateReleases,
    onError: fail,
  });
  const archiveRelease = useMutation({
    mutationFn: (id: string) => api(`/releases/${id}`, { method: "DELETE" }),
    onSuccess: invalidateReleases,
    onError: fail,
  });
  const createIteration = useMutation({
    mutationFn: () => api(`/projects/${projectId}/iterations`, {
      method: "POST",
      body: JSON.stringify({ name: iterationName.trim(), startDate: startDate || null, endDate: endDate || null }),
    }),
    onSuccess: async () => { setIterationName(""); setStartDate(""); setEndDate(""); await invalidateIterations(); },
    onError: fail,
  });
  const updateIteration = useMutation({
    mutationFn: ({ id, status }: { id: string; status: IterationStatus }) => api(`/iterations/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: invalidateIterations,
    onError: fail,
  });
  const archiveIteration = useMutation({
    mutationFn: (id: string) => api(`/iterations/${id}`, { method: "DELETE" }),
    onSuccess: invalidateIterations,
    onError: fail,
  });

  const submitRelease = (event: FormEvent) => {
    event.preventDefault();
    if (releaseName.trim()) createRelease.mutate();
  };
  const submitIteration = (event: FormEvent) => {
    event.preventDefault();
    if (iterationName.trim()) createIteration.mutate();
  };

  if (releases.isLoading || iterations.isLoading) return <p className="text-sm text-mutedForeground">{t("loading")}</p>;

  const releaseRows = releases.data ?? [];
  const iterationRows = iterations.data ?? [];

  return (
    <div className="space-y-4" data-testid="project-planning-admin">
      <Card>
        <CardHeader title={t("planning.releases")} subtitle={t("planning.releasesHelp")} badge={<Lozenge>{releaseRows.length}</Lozenge>} />
        <table className="w-full text-left text-sm">
          <TableHead className="border-b border-border bg-surfaceSubtle">
            <tr>
              <th className="px-4 py-2.5">{t("planning.name")}</th>
              <th className="px-4 py-2.5">{t("planning.status")}</th>
              <th className="px-4 py-2.5">{t("planning.releaseDate")}</th>
              <th className="px-4 py-2.5">{t("planning.progress")}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </TableHead>
          <tbody>
            {releaseRows.map((release) => (
              <tr key={release.id} data-testid={`release-row-${release.id}`} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2.5 font-medium">{release.name}</td>
                <td className="px-4 py-2.5">
                  {canManage ? (
                    <select
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      aria-label={t("planning.statusFor", { name: release.name })}
                      value={release.status}
                      onChange={(event) => updateRelease.mutate({ id: release.id, status: event.target.value as ReleaseStatus })}
                    >
                      {RELEASE_STATUSES.map((status) => (
                        <option key={status} value={status}>{t(`planning.releaseStatuses.${status}`)}</option>
                      ))}
                    </select>
                  ) : (
                    <Lozenge appearance={releaseAppearance[release.status]}>{t(`planning.releaseStatuses.${release.status}`)}</Lozenge>
                  )}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{formatDate(release.releaseDate)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={release.workItemCount ? (release.completedCount / release.workItemCount) * 100 : 0} />
                    <span className="shrink-0 tabular-nums text-xs text-mutedForeground">{release.completedCount} / {release.workItemCount}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {canManage && (
                    <button
                      type="button"
                      data-testid={`archive-release-${release.id}`}
                      aria-label={t("planning.archiveRelease", { name: release.name })}
                      className="rounded p-1.5 text-mutedForeground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => archiveRelease.mutate(release.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!releaseRows.length && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-mutedForeground">{t("planning.noReleases")}</td></tr>
            )}
          </tbody>
        </table>
        {canManage && (
          <CardBody>
            <form className="flex flex-wrap items-end gap-2" onSubmit={submitRelease}>
              <label className="min-w-48 flex-1">
                <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("planning.name")}</span>
                <input data-testid="release-name" className="input w-full" maxLength={120} value={releaseName} onChange={(event) => setReleaseName(event.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("planning.releaseDate")}</span>
                <input data-testid="release-date" type="date" className="input" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} />
              </label>
              <Button type="submit" data-testid="create-release" disabled={!releaseName.trim() || createRelease.isPending}>
                <Plus size={14} />{t("planning.addRelease")}
              </Button>
            </form>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title={t("planning.iterations")} subtitle={t("planning.iterationsHelp")} badge={<Lozenge>{iterationRows.length}</Lozenge>} />
        <table className="w-full text-left text-sm">
          <TableHead className="border-b border-border bg-surfaceSubtle">
            <tr>
              <th className="px-4 py-2.5">{t("planning.name")}</th>
              <th className="px-4 py-2.5">{t("planning.status")}</th>
              <th className="px-4 py-2.5">{t("planning.dates")}</th>
              <th className="px-4 py-2.5">{t("planning.progress")}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </TableHead>
          <tbody>
            {iterationRows.map((iteration) => (
              <tr key={iteration.id} data-testid={`iteration-row-${iteration.id}`} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2.5 font-medium">{iteration.name}</td>
                <td className="px-4 py-2.5">
                  {canManage ? (
                    <select
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      aria-label={t("planning.statusFor", { name: iteration.name })}
                      value={iteration.status}
                      onChange={(event) => updateIteration.mutate({ id: iteration.id, status: event.target.value as IterationStatus })}
                    >
                      {ITERATION_STATUSES.map((status) => (
                        <option key={status} value={status}>{t(`planning.iterationStatuses.${status}`)}</option>
                      ))}
                    </select>
                  ) : (
                    <Lozenge appearance={iterationAppearance[iteration.status]}>{t(`planning.iterationStatuses.${iteration.status}`)}</Lozenge>
                  )}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-xs">{formatDate(iteration.startDate)} - {formatDate(iteration.endDate)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={iteration.workItemCount ? (iteration.completedCount / iteration.workItemCount) * 100 : 0} />
                    <span className="shrink-0 tabular-nums text-xs text-mutedForeground">{iteration.completedCount} / {iteration.workItemCount}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {canManage && (
                    <button
                      type="button"
                      data-testid={`archive-iteration-${iteration.id}`}
                      aria-label={t("planning.archiveIteration", { name: iteration.name })}
                      className="rounded p-1.5 text-mutedForeground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => archiveIteration.mutate(iteration.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!iterationRows.length && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-mutedForeground">{t("planning.noIterations")}</td></tr>
            )}
          </tbody>
        </table>
        {canManage && (
          <CardBody>
            <form className="flex flex-wrap items-end gap-2" onSubmit={submitIteration}>
              <label className="min-w-48 flex-1">
                <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("planning.name")}</span>
                <input data-testid="iteration-name" className="input w-full" maxLength={120} value={iterationName} onChange={(event) => setIterationName(event.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("planning.startDate")}</span>
                <input data-testid="iteration-start" type="date" className="input" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-mutedForeground">{t("planning.endDate")}</span>
                <input data-testid="iteration-end" type="date" className="input" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
              <Button type="submit" data-testid="create-iteration" disabled={!iterationName.trim() || createIteration.isPending}>
                <Plus size={14} />{t("planning.addIteration")}
              </Button>
            </form>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
