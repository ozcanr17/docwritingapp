import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getSessionToken, getWsUrl } from "../lib/api";

export interface PresenceUser {
  userId: string;
  displayName: string;
}

export function useDocumentEvents(documentId: string | null): PresenceUser[] {
  const queryClient = useQueryClient();
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!documentId) return;
    let socket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const connect = () => {
      const token = getSessionToken();
      socket = new WebSocket(`${getWsUrl()}/ws/events`, token ? ["docsys.events", `docsys.jwt.${token}`] : ["docsys.events"]);
      socket.onopen = () => {
        socket?.send(JSON.stringify({ event: "join", data: { documentId } }));
        heartbeat = setInterval(() => {
          socket?.send(JSON.stringify({ event: "heartbeat", data: { documentId } }));
        }, 15000);
      };
      socket.onmessage = (message) => {
        const frame = JSON.parse(String(message.data)) as { event: string; data: never };
        if (frame.event === "joined") {
          const data = frame.data as { presence: PresenceUser[] };
          setPresence(data.presence);
        }
        if (frame.event === "domain") {
          const data = frame.data as { type: string; entityId: string; payload?: { displayName?: string } };
          if (data.type.startsWith("row.") || data.type.startsWith("link.") || data.type === "document.updated") {
            void queryClient.invalidateQueries({ queryKey: ["outline", documentId] });
            void queryClient.invalidateQueries({ queryKey: ["row"] });
          }
          if (data.type === "presence.joined") {
            setPresence((current) =>
              current.some((p) => p.userId === data.entityId)
                ? current
                : [...current, { userId: data.entityId, displayName: data.payload?.displayName ?? "?" }],
            );
          }
          if (data.type === "presence.left") {
            setPresence((current) => current.filter((p) => p.userId !== data.entityId));
          }
        }
      };
      socket.onclose = () => {
        if (heartbeat) clearInterval(heartbeat);
        setPresence([]);
        if (!closed) setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      socket?.close();
    };
  }, [documentId, queryClient]);

  return presence;
}
