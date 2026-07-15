import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

interface NotificationItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<NotificationItem[]>("/notifications"),
    refetchInterval: 30000,
  });
  const read = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = data.filter((item) => !item.readAt).length;
  return (
    <div className="relative ml-auto">
      <button data-testid="notifications-toggle" className="relative rounded-lg p-1.5 hover:bg-muted" title={t("notifications")} onClick={() => setOpen((current) => !current)}>
        <Bell size={16} />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[9px] text-white">{unread}</span>}
      </button>
      {open && (
        <div data-testid="notifications-panel" className="absolute right-0 top-full z-[80] mt-1 max-h-96 w-80 overflow-auto rounded-xl border border-border bg-surfaceElevated p-2 shadow-2xl">
          <div className="px-2 py-1.5 text-xs font-semibold">{t("notifications")}</div>
          {data.length === 0 ? <div className="px-2 py-4 text-center text-xs text-mutedForeground">{t("noNotifications")}</div> : data.map((item) => (
            <button
              key={item.id}
              className={`mb-1 block w-full rounded-lg px-2 py-2 text-left text-xs hover:bg-muted ${item.readAt ? "text-mutedForeground" : "bg-primary/5"}`}
              onClick={() => !item.readAt && read.mutate(item.id)}
            >
              <span className="block font-medium">{t(`notification_${item.type}`, { defaultValue: item.type })}</span>
              <span className="mt-0.5 block truncate text-[10px] text-mutedForeground">{String(item.payload.body ?? item.payload.title ?? "")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
