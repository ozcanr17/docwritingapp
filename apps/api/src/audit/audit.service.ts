import { Injectable } from "@nestjs/common";
import { Prisma } from "@reqtrack/database";

export interface AuditEntry {
  organizationId: string;
  workspaceId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  documentId?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  previousData?: Prisma.InputJsonValue;
  nextData?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

type AuditClient = Pick<Prisma.TransactionClient, "auditEvent">;

@Injectable()
export class AuditService {
  async record(tx: AuditClient, entry: AuditEntry): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: entry.organizationId,
        workspaceId: entry.workspaceId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        documentId: entry.documentId ?? null,
        requestId: entry.requestId ?? null,
        correlationId: entry.correlationId ?? null,
        previousData: entry.previousData,
        nextData: entry.nextData,
        metadata: entry.metadata,
      },
    });
  }
}
