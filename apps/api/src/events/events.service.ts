import { Injectable } from "@nestjs/common";
import { RedisService } from "./redis.service";

export const EVENTS_CHANNEL = "reqtrack:events";

export interface DomainEvent {
  type: string;
  documentId?: string;
  organizationId: string;
  entityId?: string;
  version?: number;
  actorId?: string;
  payload?: unknown;
  occurredAt?: string;
}

@Injectable()
export class EventsService {
  constructor(private readonly redis: RedisService) {}

  async publish(event: DomainEvent): Promise<void> {
    const enriched = { ...event, occurredAt: event.occurredAt ?? new Date().toISOString() };
    await this.redis.client.publish(EVENTS_CHANNEL, JSON.stringify(enriched));
  }
}
