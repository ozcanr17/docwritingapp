import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DocumentType, RowDetail } from "../lib/api";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface NotificationItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

interface WorkItem {
  id: string;
  kind: "assignment" | "mention" | "review";
  title: string;
  detail: string;
  rowId: string | null;
  workItemId?: string;
  document: { id: string; title: string; documentType: DocumentType } | null;
  project?: { id: string; name: string };
  createdAt: string;
}

type NotificationPriority = "action" | "update" | "routine";

export function notificationPriority(type: string): NotificationPriority {
  if (["assignment", "review_requested", "linked_test_impacted"].includes(type)) return "action";
  if (["mention", "review_completed"].includes(type)) return "update";
  return "routine";
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"notifications" | "work">("notifications");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [showRoutine, setShowRoutine] = useState(false);
  useEscapeClose(() => setOpen(false), open);
  const { data = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<NotificationItem[]>("/notifications"),
    refetchInterval: 30000,
  });
  const { data: workItems = [] } = useQuery({
    queryKey: ["my-work", query, kind],
    queryFn: () => api<WorkItem[]>(`/my-work?q=${encodeURIComponent(query.trim())}&kind=${kind}`),
    enabled: open && tab === "work",
  });
  const read = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readAll = useMutation({
    mutationFn: () => api<{ updated: number }>("/notifications/read-all", { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = data.filter((item) => !item.readAt).length;
  const groupedNotifications = useMemo(() => {
    const order: Record<NotificationPriority, number> = { action: 0, update: 1, routine: 2 };
    const sorted = [...data].sort((left, right) => {
      if (Boolean(left.readAt) !== Boolean(right.readAt)) return left.readAt ? 1 : -1;
      const priority = order[notificationPriority(left.type)] - order[notificationPriority(right.type)];
      return priority || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
    return {
      action: sorted.filter((item) => notificationPriority(item.type) === "action"),
      update: sorted.filter((item) => notificationPriority(item.type) === "update"),
      routine: sorted.filter((item) => notificationPriority(item.type) === "routine"),
    };
  }, [data]);
  const openRow = async (rowId: string) => {
    const row = await api<RowDetail>(`/rows/${rowId}`);
    window.dispatchEvent(new CustomEvent("docsys:open-document-row", { detail: { document: row.document, rowId } }));
    setOpen(false);
  };
  const openWorkItem = () => {
    window.dispatchEvent(new CustomEvent("docsys:open-work-hub"));
    setOpen(false);
  };
  return (
    <div className="relative ml-auto">
      <button data-testid="notifications-toggle" className="relative rounded-lg p-1.5 hover:bg-muted" title={t("notifications")} onClick={() => setOpen((current) => !current)}>
        <Bell size={16} />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] text-white">{unread}</span>}
      </button>
      {open && (
        <div data-testid="notifications-panel" className="absolute right-0 top-full z-[210] mt-1 w-[25rem] max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-surfaceElevated p-2 shadow-2xl">
          <div className="mb-2 grid grid-cols-2 rounded-lg bg-editorBackground p-0.5"><button className={`rounded-md px-2 py-1.5 text-xs ${tab === "notifications" ? "bg-surface shadow-sm" : "text-mutedForeground"}`} onClick={() => setTab("notifications")}>{t("notifications")}{unread > 0 ? ` (${unread})` : ""}</button><button data-testid="my-work-tab" className={`rounded-md px-2 py-1.5 text-xs ${tab === "work" ? "bg-surface shadow-sm" : "text-mutedForeground"}`} onClick={() => setTab("work")}>{t("myWork")}</button></div>
          {tab === "notifications" && <div>{unread > 0 && <div className="mb-1 flex justify-end"><button className="rounded-lg px-2 py-1 text-[10px] text-primary hover:bg-primary/10" disabled={readAll.isPending} onClick={() => readAll.mutate()}>{t("markAllRead")}</button></div>}<div className="max-h-96 overflow-auto">{data.length === 0 ? <div className="px-2 py-4 text-center text-xs text-mutedForeground">{t("noNotifications")}</div> : <>
            <NotificationGroup title={t("notificationActionRequired")} items={groupedNotifications.action} tone="text-warning" onOpen={(item) => { if (!item.readAt) read.mutate(item.id); const rowId = typeof item.payload.rowId === "string" ? item.payload.rowId : null; if (rowId) void openRow(rowId); }} />
            <NotificationGroup title={t("notificationUpdates")} items={groupedNotifications.update} onOpen={(item) => { if (!item.readAt) read.mutate(item.id); const rowId = typeof item.payload.rowId === "string" ? item.payload.rowId : null; if (rowId) void openRow(rowId); }} />
            {groupedNotifications.routine.length > 0 && <section><button type="button" data-testid="routine-notifications-toggle" className="flex w-full items-center gap-1 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-mutedForeground hover:text-foreground" onClick={() => setShowRoutine((current) => !current)}>{showRoutine ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{t("notificationRoutine")}<span className="ml-auto rounded-full bg-muted px-1.5 py-0.5">{groupedNotifications.routine.length}</span></button>{showRoutine && <NotificationGroup items={groupedNotifications.routine} onOpen={(item) => { if (!item.readAt) read.mutate(item.id); const rowId = typeof item.payload.rowId === "string" ? item.payload.rowId : null; if (rowId) void openRow(rowId); }} />}</section>}
          </>}</div></div>}
          {tab === "work" && <div><div className="mb-2 flex gap-1.5"><label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-editorBackground px-2"><Search size={12} /><input data-testid="my-work-search" className="min-w-0 flex-1 bg-transparent py-1.5 text-xs outline-none" value={query} placeholder={t("searchMyWork")} onChange={(event) => setQuery(event.target.value)} /></label><select className="rounded-lg border border-border bg-editorBackground px-1.5 text-xs" value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">{t("all")}</option><option value="assignment">{t("assignments")}</option><option value="mention">{t("mentions")}</option><option value="review">{t("reviews")}</option></select></div><div className="max-h-96 overflow-auto">{workItems.length === 0 ? <div className="px-2 py-4 text-center text-xs text-mutedForeground">{t("noMyWork")}</div> : workItems.map((item) => <button key={item.id} className="mb-1 block w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-muted" onClick={() => item.rowId ? void openRow(item.rowId) : item.workItemId ? openWorkItem() : undefined}><span className="flex items-center justify-between gap-2"><span className="font-medium">{item.title}</span><span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] uppercase text-primary">{t(`work_${item.kind}`)}</span></span><span className="mt-0.5 block line-clamp-2 text-[10px] text-mutedForeground">{item.detail}</span><span className="mt-1 block truncate text-[9px] text-mutedForeground">{item.document?.title ?? item.project?.name ?? ""}</span></button>)}</div></div>}
        </div>
      )}
    </div>
  );
}

function NotificationGroup({ title, items, tone = "text-mutedForeground", onOpen }: { title?: string; items: NotificationItem[]; tone?: string; onOpen: (item: NotificationItem) => void }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return <section className="mb-2">{title && <div className={`px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{title}</div>}{items.map((item) => <button key={item.id} data-priority={notificationPriority(item.type)} className={`mb-1 block w-full rounded-lg border-l-2 px-2 py-2 text-left text-xs hover:bg-muted ${notificationPriority(item.type) === "action" ? "border-warning" : "border-transparent"} ${item.readAt ? "text-mutedForeground" : "bg-primary/5"}`} onClick={() => onOpen(item)}><span className="flex items-center justify-between gap-2"><span className="font-medium">{t(`notification_${item.type}`, { defaultValue: item.type })}</span>{!item.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}</span><span className="mt-0.5 block truncate text-[10px] text-mutedForeground">{String(item.payload.body ?? item.payload.title ?? "")}</span></button>)}</section>;
}
