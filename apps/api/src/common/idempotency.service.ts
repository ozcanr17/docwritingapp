import { Injectable } from "@nestjs/common";
import { RedisService } from "../events/redis.service";

const TTL_SECONDS = 86400;

@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  async runOnce<T>(userId: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
    if (!key) return fn();
    const cacheKey = `reqtrack:idem:${userId}:${key}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as T;
    const result = await fn();
    await this.redis.client.set(cacheKey, JSON.stringify(result), "EX", TTL_SECONDS, "NX");
    return result;
  }
}
