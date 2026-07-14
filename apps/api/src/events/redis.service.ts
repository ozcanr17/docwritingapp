import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { apiEnv } from "../env";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  readonly subscriber: Redis;

  constructor() {
    const url = apiEnv().REDIS_URL;
    this.client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
    this.subscriber = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }
}
