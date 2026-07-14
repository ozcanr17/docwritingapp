import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { apiEnv } from "../env";

export const EXPORT_QUEUE_NAME = "docsys-exports";

export interface ExportJobPayload {
  exportJobId: string;
}

@Injectable()
export class ExportQueue implements OnModuleDestroy {
  readonly queue: Queue<ExportJobPayload>;

  constructor() {
    const url = new URL(apiEnv().REDIS_URL);
    this.queue = new Queue<ExportJobPayload>(EXPORT_QUEUE_NAME, {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        maxRetriesPerRequest: null,
      },
    });
  }

  async enqueue(payload: ExportJobPayload): Promise<void> {
    await this.queue.add("export", payload, {
      jobId: payload.exportJobId,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
