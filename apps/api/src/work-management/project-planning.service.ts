import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@docsys/database";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../access/access.service";
import { AuditService } from "../audit/audit.service";

type ReleaseStatus = "planned" | "active" | "released";
type IterationStatus = "planned" | "active" | "completed";

export type ReleaseInput = {
  name: string;
  description?: string | null;
  status?: ReleaseStatus;
  releaseDate?: string | null;
};

export type IterationInput = {
  name: string;
  goal?: string | null;
  status?: IterationStatus;
  startDate?: string | null;
  endDate?: string | null;
};

@Injectable()
export class ProjectPlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async listReleases(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "project.read", this.scope(project));
    const releases = await this.prisma.projectRelease.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ releaseDate: "asc" }, { name: "asc" }],
    });
    const counts = await this.prisma.workItem.groupBy({
      by: ["releaseId", "status"],
      where: { projectId, deletedAt: null, releaseId: { not: null } },
      _count: { _all: true },
    });
    return releases.map((release) => ({ ...release, ...this.progress(counts, "releaseId", release.id) }));
  }

  async listIterations(actorId: string, projectId: string) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "project.read", this.scope(project));
    const iterations = await this.prisma.projectIteration.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ startDate: "asc" }, { name: "asc" }],
    });
    const counts = await this.prisma.workItem.groupBy({
      by: ["iterationId", "status"],
      where: { projectId, deletedAt: null, iterationId: { not: null } },
      _count: { _all: true },
    });
    return iterations.map((iteration) => ({ ...iteration, ...this.progress(counts, "iterationId", iteration.id) }));
  }

  async createRelease(actorId: string, projectId: string, input: ReleaseInput) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "project.manage", this.scope(project));
    const data = {
      organizationId: project.organizationId,
      projectId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      status: (input.status ?? "planned") as ReleaseStatus,
      releaseDate: this.date(input.releaseDate),
      createdById: actorId,
    };
    return this.prisma.$transaction(async (tx) => {
      const release = await this.guardName(() => tx.projectRelease.create({ data }), "release");
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "release.created",
        entityType: "project_release",
        entityId: release.id,
        nextData: data as unknown as Prisma.InputJsonValue,
      });
      return release;
    });
  }

  async createIteration(actorId: string, projectId: string, input: IterationInput) {
    const project = await this.requireProject(projectId);
    await this.access.assertPermission(actorId, "project.manage", this.scope(project));
    const data = {
      organizationId: project.organizationId,
      projectId,
      name: input.name.trim(),
      goal: input.goal?.trim() || null,
      status: (input.status ?? "planned") as IterationStatus,
      startDate: this.date(input.startDate),
      endDate: this.date(input.endDate),
      createdById: actorId,
    };
    this.assertRange(data.startDate, data.endDate);
    return this.prisma.$transaction(async (tx) => {
      const iteration = await this.guardName(() => tx.projectIteration.create({ data }), "iteration");
      await this.audit.record(tx, {
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        actorId,
        action: "iteration.created",
        entityType: "project_iteration",
        entityId: iteration.id,
        nextData: data as unknown as Prisma.InputJsonValue,
      });
      return iteration;
    });
  }

  async updateRelease(actorId: string, releaseId: string, input: Partial<ReleaseInput>) {
    const release = await this.prisma.projectRelease.findFirst({ where: { id: releaseId, deletedAt: null }, include: { project: true } });
    if (!release) throw new NotFoundException("Release not found");
    await this.access.assertPermission(actorId, "project.manage", this.scope(release.project));
    const data = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.releaseDate !== undefined ? { releaseDate: this.date(input.releaseDate) } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.guardName(() => tx.projectRelease.update({ where: { id: releaseId }, data }), "release");
      await this.audit.record(tx, {
        organizationId: release.organizationId,
        workspaceId: release.project.workspaceId,
        actorId,
        action: "release.updated",
        entityType: "project_release",
        entityId: releaseId,
        previousData: { name: release.name, description: release.description, status: release.status, releaseDate: release.releaseDate } as unknown as Prisma.InputJsonValue,
        nextData: data as unknown as Prisma.InputJsonValue,
      });
      return updated;
    });
  }

  async updateIteration(actorId: string, iterationId: string, input: Partial<IterationInput>) {
    const iteration = await this.prisma.projectIteration.findFirst({ where: { id: iterationId, deletedAt: null }, include: { project: true } });
    if (!iteration) throw new NotFoundException("Iteration not found");
    await this.access.assertPermission(actorId, "project.manage", this.scope(iteration.project));
    const data = {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.goal !== undefined ? { goal: input.goal?.trim() || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.startDate !== undefined ? { startDate: this.date(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: this.date(input.endDate) } : {}),
    };
    this.assertRange(
      data.startDate !== undefined ? data.startDate : iteration.startDate,
      data.endDate !== undefined ? data.endDate : iteration.endDate,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.guardName(() => tx.projectIteration.update({ where: { id: iterationId }, data }), "iteration");
      await this.audit.record(tx, {
        organizationId: iteration.organizationId,
        workspaceId: iteration.project.workspaceId,
        actorId,
        action: "iteration.updated",
        entityType: "project_iteration",
        entityId: iterationId,
        previousData: { name: iteration.name, goal: iteration.goal, status: iteration.status, startDate: iteration.startDate, endDate: iteration.endDate } as unknown as Prisma.InputJsonValue,
        nextData: data as unknown as Prisma.InputJsonValue,
      });
      return updated;
    });
  }

  async archiveRelease(actorId: string, releaseId: string) {
    const release = await this.prisma.projectRelease.findFirst({ where: { id: releaseId, deletedAt: null }, include: { project: true } });
    if (!release) throw new NotFoundException("Release not found");
    await this.access.assertPermission(actorId, "project.manage", this.scope(release.project));
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.workItem.updateMany({ where: { releaseId, deletedAt: null }, data: { releaseId: null } });
      await tx.projectRelease.update({ where: { id: releaseId }, data: { deletedAt: now, deletedById: actorId } });
      await this.audit.record(tx, {
        organizationId: release.organizationId,
        workspaceId: release.project.workspaceId,
        actorId,
        action: "release.archived",
        entityType: "project_release",
        entityId: releaseId,
        previousData: { deletedAt: null },
        nextData: { deletedAt: now } as unknown as Prisma.InputJsonValue,
      });
    });
    return { ok: true };
  }

  async archiveIteration(actorId: string, iterationId: string) {
    const iteration = await this.prisma.projectIteration.findFirst({ where: { id: iterationId, deletedAt: null }, include: { project: true } });
    if (!iteration) throw new NotFoundException("Iteration not found");
    await this.access.assertPermission(actorId, "project.manage", this.scope(iteration.project));
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.workItem.updateMany({ where: { iterationId, deletedAt: null }, data: { iterationId: null } });
      await tx.testPlanItem.updateMany({ where: { iterationId, deletedAt: null }, data: { iterationId: null } });
      await tx.testExecution.updateMany({ where: { iterationId }, data: { iterationId: null } });
      await tx.projectIteration.update({ where: { id: iterationId }, data: { deletedAt: now, deletedById: actorId } });
      await this.audit.record(tx, {
        organizationId: iteration.organizationId,
        workspaceId: iteration.project.workspaceId,
        actorId,
        action: "iteration.archived",
        entityType: "project_iteration",
        entityId: iterationId,
        previousData: { deletedAt: null },
        nextData: { deletedAt: now } as unknown as Prisma.InputJsonValue,
      });
    });
    return { ok: true };
  }

  async assertReleaseInProject(releaseId: string, projectId: string) {
    const release = await this.prisma.projectRelease.findFirst({ where: { id: releaseId, projectId, deletedAt: null }, select: { id: true } });
    if (!release) throw new NotFoundException("Release is not available in this project");
  }

  async assertIterationInProject(iterationId: string, projectId: string) {
    const iteration = await this.prisma.projectIteration.findFirst({ where: { id: iterationId, projectId, deletedAt: null }, select: { id: true } });
    if (!iteration) throw new NotFoundException("Iteration is not available in this project");
  }

  private progress(
    counts: Array<{ releaseId?: string | null; iterationId?: string | null; status: string; _count: { _all: number } }>,
    key: "releaseId" | "iterationId",
    id: string,
  ) {
    const mine = counts.filter((entry) => entry[key] === id);
    const total = mine.reduce((sum, entry) => sum + entry._count._all, 0);
    const completed = mine
      .filter((entry) => entry.status === "done")
      .reduce((sum, entry) => sum + entry._count._all, 0);
    return { workItemCount: total, completedCount: completed };
  }

  private assertRange(start: Date | null | undefined, end: Date | null | undefined) {
    if (start && end && start > end) throw new ConflictException("Iteration cannot end before it starts");
  }

  private date(value: string | null | undefined) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new ConflictException("Invalid date");
    return parsed;
  }

  private async guardName<T>(operation: () => Promise<T>, kind: "release" | "iteration") {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(`A ${kind} with this name already exists in the project`);
      }
      throw error;
    }
  }

  private async requireProject(id: string) {
    const project = await this.prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private scope(project: { organizationId: string; workspaceId: string; id: string }) {
    return { organizationId: project.organizationId, workspaceId: project.workspaceId, projectId: project.id };
  }
}
