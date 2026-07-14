import { Global, Module } from "@nestjs/common";
import { IdempotencyService } from "../common/idempotency.service";
import { EventsGateway } from "./events.gateway";
import { EventsService } from "./events.service";
import { PresenceService } from "./presence.service";
import { RedisService } from "./redis.service";

@Global()
@Module({
  providers: [RedisService, EventsService, PresenceService, EventsGateway, IdempotencyService],
  exports: [RedisService, EventsService, PresenceService, IdempotencyService],
})
export class EventsModule {}
