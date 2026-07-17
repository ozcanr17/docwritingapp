import { AlertTriangle, Check, CloudOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSaveStatusStore } from "../stores/saveStatus";

export function SaveStatusIndicator({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const stored = useSaveStatusStore((state) => state.documents[documentId]);
  const setStatus = useSaveStatusStore((state) => state.setStatus);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      const current = useSaveStatusStore.getState().documents[documentId]?.state;
      setStatus(documentId, navigator.onLine ? current === "conflict" ? "conflict" : "saved" : "offline");
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if (!navigator.onLine) setStatus(documentId, "offline");
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [documentId, setStatus]);
  const state = online ? stored?.state ?? "saved" : "offline";
  const content = state === "saving"
    ? { icon: <LoaderCircle size={13} className="animate-spin" />, label: t("saveState.saving"), tone: "text-mutedForeground" }
    : state === "conflict"
      ? { icon: <AlertTriangle size={13} />, label: t("saveState.conflict"), tone: "text-destructive" }
      : state === "offline"
        ? { icon: <CloudOff size={13} />, label: t("saveState.offline"), tone: "text-warning" }
        : { icon: <Check size={13} />, label: t("saveState.saved"), tone: "text-success" };
  return <div data-testid="save-status" role="status" aria-live="polite" className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs ${content.tone}`}>{content.icon}<span>{content.label}</span></div>;
}
