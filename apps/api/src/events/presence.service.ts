import { Injectable } from "@nestjs/common";
import { RedisService } from "./redis.service";

const PRESENCE_TTL_SECONDS = 30;

@Injectable()
export class PresenceService {
  constructor(private readonly redis: RedisService) {}

  private key(documentId: string, userId: string): string {
    return `docsys:presence:${documentId}:${userId}`;
  }

  async heartbeat(documentId: string, userId: string, displayName: string): Promise<void> {
    await this.redis.client.set(
      this.key(documentId, userId),
      JSON.stringify({ userId, displayName, lastSeenAt: new Date().toISOString() }),
      "EX",
      PRESENCE_TTL_SECONDS,
    );
  }

  async leave(documentId: string, userId: string): Promise<void> {
    await this.redis.client.del(this.key(documentId, userId));
  }

  async list(documentId: string): Promise<Array<{ userId: string; displayName: string; lastSeenAt: string }>> {
    const keys = await this.redis.client.keys(`docsys:presence:${documentId}:*`);
    if (keys.length === 0) return [];
    const values = await this.redis.client.mget(keys);
    return values.filter((v): v is string => v !== null).map((v) => JSON.parse(v));
  }
}
