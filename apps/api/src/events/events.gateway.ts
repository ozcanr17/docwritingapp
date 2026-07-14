import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { IncomingMessage } from "http";
import { WebSocket } from "ws";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../access/access.service";
import { SESSION_COOKIE } from "../auth/auth.types";
import { EVENTS_CHANNEL } from "./events.service";
import { PresenceService } from "./presence.service";
import { RedisService } from "./redis.service";

interface ClientState {
  userId: string;
  displayName: string;
  documentIds: Set<string>;
}

@Injectable()
@WebSocketGateway({ path: "/ws/events" })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  private readonly clients = new Map<WebSocket, ClientState>();
  private readonly authPromises = new Map<WebSocket, Promise<ClientState | null>>();
  private readonly rooms = new Map<string, Set<WebSocket>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly redis: RedisService,
    private readonly presence: PresenceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redis.subscriber.subscribe(EVENTS_CHANNEL);
    this.redis.subscriber.on("message", (_channel: string, message: string) => {
      this.fanOut(message);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.subscriber.unsubscribe(EVENTS_CHANNEL).catch(() => undefined);
  }

  handleConnection(client: WebSocket, request: IncomingMessage): void {
    const authPromise = this.authenticate(client, request);
    this.authPromises.set(client, authPromise);
  }

  private async authenticate(client: WebSocket, request: IncomingMessage): Promise<ClientState | null> {
    const token = this.extractToken(request);
    if (!token) {
      client.close(4401, "Unauthorized");
      return null;
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.deletedAt || !user.isActive) {
        client.close(4401, "Unauthorized");
        return null;
      }
      const state: ClientState = { userId: user.id, displayName: user.displayName, documentIds: new Set() };
      this.clients.set(client, state);
      return state;
    } catch {
      client.close(4401, "Unauthorized");
      return null;
    }
  }

  private async resolveState(client: WebSocket): Promise<ClientState | null> {
    const existing = this.clients.get(client);
    if (existing) return existing;
    const pending = this.authPromises.get(client);
    return pending ? pending : null;
  }

  async handleDisconnect(client: WebSocket): Promise<void> {
    this.authPromises.delete(client);
    const state = this.clients.get(client);
    if (!state) return;
    for (const documentId of state.documentIds) {
      this.rooms.get(documentId)?.delete(client);
      await this.presence.leave(documentId, state.userId);
      await this.redis.client.publish(
        EVENTS_CHANNEL,
        JSON.stringify({ type: "presence.left", documentId, organizationId: "", entityId: state.userId }),
      );
    }
    this.clients.delete(client);
  }

  @SubscribeMessage("join")
  async onJoin(client: WebSocket, data: { documentId: string }) {
    try {
      return await this.join(client, data);
    } catch (error) {
      return { event: "error", data: error instanceof Error ? error.message : "Join failed" };
    }
  }

  private async join(client: WebSocket, data: { documentId: string }) {
    const state = await this.resolveState(client);
    if (!state || typeof data?.documentId !== "string") return { event: "error", data: "Invalid join" };
    const document = await this.prisma.document.findFirst({
      where: { id: data.documentId, deletedAt: null },
    });
    if (!document) return { event: "error", data: "Document not found" };
    const allowed = await this.access.hasPermission(state.userId, "document.read", {
      organizationId: document.organizationId,
      workspaceId: document.workspaceId,
    });
    if (!allowed) return { event: "error", data: "Forbidden" };
    state.documentIds.add(document.id);
    let room = this.rooms.get(document.id);
    if (!room) {
      room = new Set();
      this.rooms.set(document.id, room);
    }
    room.add(client);
    await this.presence.heartbeat(document.id, state.userId, state.displayName);
    await this.redis.client.publish(
      EVENTS_CHANNEL,
      JSON.stringify({
        type: "presence.joined",
        documentId: document.id,
        organizationId: document.organizationId,
        entityId: state.userId,
        payload: { displayName: state.displayName },
      }),
    );
    const present = await this.presence.list(document.id);
    return { event: "joined", data: { documentId: document.id, presence: present } };
  }

  @SubscribeMessage("heartbeat")
  async onHeartbeat(client: WebSocket, data: { documentId: string }) {
    const state = this.clients.get(client);
    if (!state || !state.documentIds.has(data?.documentId)) return;
    await this.presence.heartbeat(data.documentId, state.userId, state.displayName);
  }

  @SubscribeMessage("leave")
  async onLeave(client: WebSocket, data: { documentId: string }) {
    const state = this.clients.get(client);
    if (!state || typeof data?.documentId !== "string") return;
    state.documentIds.delete(data.documentId);
    this.rooms.get(data.documentId)?.delete(client);
    await this.presence.leave(data.documentId, state.userId);
  }

  private fanOut(message: string): void {
    let parsed: { documentId?: string };
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (!parsed.documentId) return;
    const room = this.rooms.get(parsed.documentId);
    if (!room) return;
    const frame = JSON.stringify({ event: "domain", data: JSON.parse(message) });
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) client.send(frame);
    }
  }

  private extractToken(request: IncomingMessage): string | null {
    const cookieHeader = request.headers.cookie ?? "";
    const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    if (match?.[1]) return decodeURIComponent(match[1]);
    const auth = request.headers.authorization;
    if (auth?.startsWith("Bearer ")) return auth.slice(7);
    const url = new URL(request.url ?? "/", "http://localhost");
    return url.searchParams.get("token");
  }
}
