import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@docsys/database";

export type ProjectRecordKind = "work_item" | "test_plan" | "document" | "test_execution";

const TEST_KINDS: ProjectRecordKind[] = ["test_plan", "document", "test_execution"];

@Injectable()
export class ProjectKeyService {
  async allocate(
    tx: Prisma.TransactionClient,
    projectId: string,
    kind: ProjectRecordKind,
    options: { documentType?: "requirement" | "test" | "general_document" } = {},
  ): Promise<{ key: string; sequence: number }> {
    const project = await tx.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, code: true, keyStrategy: true, testCode: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    const separateTestSequence =
      project.keyStrategy === "per_type" && this.isTestRecord(kind, options.documentType);

    const [updated] = separateTestSequence
      ? await tx.$queryRaw<Array<{ sequence: number }>>`
          UPDATE "projects"
          SET "nextTestNumber" = "nextTestNumber" + 1
          WHERE "id" = ${projectId}::uuid
          RETURNING "nextTestNumber" - 1 AS "sequence"`
      : await tx.$queryRaw<Array<{ sequence: number }>>`
          UPDATE "projects"
          SET "nextRecordNumber" = "nextRecordNumber" + 1
          WHERE "id" = ${projectId}::uuid
          RETURNING "nextRecordNumber" - 1 AS "sequence"`;

    if (!updated) throw new NotFoundException("Project not found");
    const sequence = Number(updated.sequence);
    const code = separateTestSequence ? project.testCode || `${project.code}T` : project.code;
    return { key: `${code}-${sequence}`, sequence };
  }

  private isTestRecord(kind: ProjectRecordKind, documentType?: string): boolean {
    if (kind === "document") return documentType === "test";
    return TEST_KINDS.includes(kind);
  }
}
