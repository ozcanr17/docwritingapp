import { Injectable, NotFoundException } from "@nestjs/common";
import { ExecutionStatus, Prisma } from "@docsys/database";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../access/access.service";
import { resolveTestScenario } from "../common/test-scenarios";

export const EXECUTION_STATUSES: ExecutionStatus[] = ["not_run", "running", "passed", "failed", "blocked", "skipped"];

/**
 * Counts of the latest execution per planned test. `notRun` covers planned tests
 * that have never been executed as well as executions still sitting at not_run,
 * so the six buckets always add up to `planned`.
 */
export interface StatusTotals {
  planned: number;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  running: number;
  notRun: number;
  passRate: number;
  completionRate: number;
}

const EXECUTION_INCLUDE = {
  executedBy: { select: { id: true, displayName: true } },
  testCaseRow: { select: { id: true, title: true, objectNumber: true, document: { select: { id: true, title: true, key: true } } } },
  project: { select: { id: true, code: true, name: true } },
  testPlanItem: { select: { id: true, testPlan: { select: { id: true, key: true, name: true } } } },
  steps: { select: { id: true, status: true } },
} satisfies Prisma.TestExecutionInclude;

function emptyTotals(): StatusTotals {
  return { planned: 0, executed: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, running: 0, notRun: 0, passRate: 0, completionRate: 0 };
}

function countStatus(totals: StatusTotals, status: ExecutionStatus | null): void {
  totals.planned += 1;
  if (status === null || status === "not_run") {
    totals.notRun += 1;
    return;
  }
  totals.executed += 1;
  if (status === "passed") totals.passed += 1;
  else if (status === "failed") totals.failed += 1;
  else if (status === "blocked") totals.blocked += 1;
  else if (status === "skipped") totals.skipped += 1;
  else totals.running += 1;
}

/** Pass rate is share of *decided* runs; completion is share of the plan that has a verdict. */
function finalizeTotals(totals: StatusTotals): StatusTotals {
  const decided = totals.passed + totals.failed + totals.blocked + totals.skipped;
  totals.passRate = decided ? Math.round((totals.passed / decided) * 100) : 0;
  totals.completionRate = totals.planned ? Math.round((decided / totals.planned) * 100) : 0;
  return totals;
}

@Injectable()
export class TestExecutionReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async listWorkspaceExecutions(
    actorId: string,
    workspaceId: string,
    filters: { projectId?: string; status?: ExecutionStatus[]; testPlanId?: string; limit?: number } = {},
  ) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null }, select: { id: true, organizationId: true } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    await this.access.assertPermission(actorId, "workspace.read", { organizationId: workspace.organizationId, workspaceId });

    const executions = await this.prisma.testExecution.findMany({
      where: {
        testCaseRow: { deletedAt: null, document: { workspaceId, deletedAt: null } },
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.status?.length ? { status: { in: filters.status } } : {}),
        ...(filters.testPlanId ? { testPlanItem: { testPlanId: filters.testPlanId } } : {}),
      },
      include: EXECUTION_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: Math.min(filters.limit ?? 200, 500),
    });
    const readable = await this.access.readableRowIds(actorId, executions.map((execution) => execution.testCaseRowId));
    const visible = executions.filter((execution) => readable.has(execution.testCaseRowId));

    const totals = emptyTotals();
    for (const execution of visible) countStatus(totals, execution.status);
    return { executions: visible.map((execution) => this.presentExecution(execution)), totals: finalizeTotals(totals) };
  }

  /**
   * Runnable test scenarios across the workspace, for choosing what to execute.
   * A scenario is only runnable when it actually owns test steps, so the same
   * subtree walk the plan candidate list uses is applied here.
   */
  async listWorkspaceTestScenarios(actorId: string, workspaceId: string, query: string) {
    const workspace = await this.prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null }, select: { id: true, organizationId: true } });
    if (!workspace) throw new NotFoundException("Workspace not found");
    await this.access.assertPermission(actorId, "workspace.read", { organizationId: workspace.organizationId, workspaceId });

    const rows = await this.prisma.documentRow.findMany({
      where: { deletedAt: null, document: { workspaceId, documentType: "test", deletedAt: null } },
      select: { id: true, parentId: true, rowType: true, title: true, objectNumber: true, document: { select: { id: true, title: true, key: true } } },
      orderBy: [{ documentId: "asc" }, { rank: "asc" }],
      take: 10000,
    });
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const scenarios = new Map<string, (typeof rows)[number] & { stepCount: number }>();
    for (const row of rows) {
      if (row.rowType !== "test_step") continue;
      const scenario = resolveTestScenario(row.id, rowsById);
      if (!scenario || !["heading", "test_case"].includes(scenario.rowType)) continue;
      const full = rowsById.get(scenario.id);
      if (!full) continue;
      const current = scenarios.get(full.id);
      scenarios.set(full.id, { ...full, stepCount: (current?.stepCount ?? 0) + 1 });
    }
    const normalized = query.trim().toLocaleLowerCase();
    const candidates = [...scenarios.values()].filter(
      (row) => !normalized || `${row.title} ${row.objectNumber} ${row.document.title} ${row.document.key ?? ""}`.toLocaleLowerCase().includes(normalized),
    );
    const readable = await this.access.readableRowIds(actorId, candidates.map((candidate) => candidate.id));
    return candidates
      .filter((candidate) => readable.has(candidate.id))
      .slice(0, 100)
      .map((candidate) => ({ id: candidate.id, title: candidate.title, objectNumber: candidate.objectNumber, stepCount: candidate.stepCount, document: candidate.document }));
  }

  async getPlanExecutionReport(actorId: string, testPlanId: string) {
    const plan = await this.prisma.testPlan.findFirst({
      where: { id: testPlanId, deletedAt: null },
      include: {
        project: { select: { id: true, code: true, name: true } },
        owner: { select: { id: true, displayName: true } },
        items: {
          where: { deletedAt: null },
          orderBy: { rank: "asc" },
          include: {
            assignee: { select: { id: true, displayName: true } },
            testCaseRow: { select: { id: true, title: true, objectNumber: true, document: { select: { id: true, title: true, key: true } } } },
            executions: { orderBy: { createdAt: "desc" }, include: EXECUTION_INCLUDE },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException("Test plan not found");
    await this.access.assertPermission(actorId, "test_plan.read", {
      organizationId: plan.organizationId,
      workspaceId: plan.workspaceId,
      projectId: plan.projectId,
    });
    const readable = await this.access.readableRowIds(actorId, plan.items.map((item) => item.testCaseRowId));
    const items = plan.items.filter((item) => readable.has(item.testCaseRowId));

    const defectIds = new Set<string>();
    for (const item of items) {
      for (const execution of item.executions) defectIds.add(execution.id);
    }
    const defects = defectIds.size ? await this.findLinkedDefects([...defectIds]) : new Map<string, DefectSummary[]>();

    const totals = emptyTotals();
    const iterations = new Map<string, StatusTotals>();
    const assignees = new Map<string, { id: string | null; displayName: string | null; totals: StatusTotals }>();

    const reportItems = items.map((item) => {
      const latest = item.executions[0] ?? null;
      const status = latest?.status ?? null;
      countStatus(totals, status);

      const iterationKey = item.iteration ?? latest?.iteration ?? "";
      const iterationTotals = iterations.get(iterationKey) ?? emptyTotals();
      countStatus(iterationTotals, status);
      iterations.set(iterationKey, iterationTotals);

      const assigneeKey = item.assignee?.id ?? "";
      const assigneeBucket = assignees.get(assigneeKey) ?? { id: item.assignee?.id ?? null, displayName: item.assignee?.displayName ?? null, totals: emptyTotals() };
      countStatus(assigneeBucket.totals, status);
      assignees.set(assigneeKey, assigneeBucket);

      const itemDefects = item.executions.flatMap((execution) => defects.get(execution.id) ?? []);
      return {
        id: item.id,
        iteration: item.iteration,
        environment: item.environment ?? plan.environment,
        assignee: item.assignee,
        testCaseRow: item.testCaseRow,
        status,
        executionCount: item.executions.length,
        latestExecution: latest ? this.presentExecution(latest) : null,
        defects: dedupeById(itemDefects),
      };
    });

    return {
      plan: {
        id: plan.id,
        key: plan.key,
        name: plan.name,
        description: plan.description,
        status: plan.status,
        environment: plan.environment,
        buildReference: plan.buildReference,
        startsAt: plan.startsAt,
        endsAt: plan.endsAt,
        owner: plan.owner,
        project: plan.project,
      },
      totals: finalizeTotals(totals),
      iterations: [...iterations.entries()]
        .map(([iteration, value]) => ({ iteration, ...finalizeTotals(value) }))
        .sort((a, b) => a.iteration.localeCompare(b.iteration)),
      assignees: [...assignees.values()]
        .map((entry) => ({ ...entry, totals: finalizeTotals(entry.totals) }))
        .sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? "")),
      items: reportItems,
      defects: dedupeById(reportItems.flatMap((item) => item.defects)),
    };
  }

  /**
   * Defects reach an execution either directly or through one of its steps, so
   * both link shapes are collected and keyed back to the execution.
   */
  private async findLinkedDefects(executionIds: string[]): Promise<Map<string, DefectSummary[]>> {
    const links = await this.prisma.workItemArtifactLink.findMany({
      where: {
        OR: [{ testExecutionId: { in: executionIds } }, { testStepExecution: { executionId: { in: executionIds } } }],
      },
      select: {
        testExecutionId: true,
        testStepExecution: { select: { executionId: true } },
        workItem: { select: { id: true, key: true, title: true, status: true, priority: true, type: true, deletedAt: true } },
      },
    });
    const byExecution = new Map<string, DefectSummary[]>();
    for (const link of links) {
      const executionId = link.testExecutionId ?? link.testStepExecution?.executionId;
      if (!executionId || !link.workItem || link.workItem.deletedAt) continue;
      const { deletedAt: _deletedAt, ...summary } = link.workItem;
      const bucket = byExecution.get(executionId);
      if (bucket) bucket.push(summary);
      else byExecution.set(executionId, [summary]);
    }
    return byExecution;
  }

  private presentExecution(execution: Prisma.TestExecutionGetPayload<{ include: typeof EXECUTION_INCLUDE }>) {
    const steps = execution.steps;
    return {
      id: execution.id,
      key: execution.key,
      status: execution.status,
      environment: execution.environment,
      buildReference: execution.buildReference,
      iteration: execution.iteration,
      notes: execution.notes,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      createdAt: execution.createdAt,
      executedBy: execution.executedBy,
      testCaseRow: execution.testCaseRow,
      project: execution.project,
      testPlan: execution.testPlanItem?.testPlan ?? null,
      stepTotals: {
        total: steps.length,
        passed: steps.filter((step) => step.status === "passed").length,
        failed: steps.filter((step) => step.status === "failed").length,
        blocked: steps.filter((step) => step.status === "blocked").length,
        skipped: steps.filter((step) => step.status === "skipped").length,
        notRun: steps.filter((step) => step.status === "not_run").length,
      },
    };
  }
}

interface DefectSummary {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  type: string;
}

function dedupeById<T extends { id: string }>(values: T[]): T[] {
  const seen = new Map<string, T>();
  for (const value of values) if (!seen.has(value.id)) seen.set(value.id, value);
  return [...seen.values()];
}
