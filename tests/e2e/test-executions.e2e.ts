import { expect, test, type Page } from "@playwright/test";
import { registerWorkspace } from "./helpers";

/**
 * Fixture setup runs through the API rather than the document editor. Driving the
 * whole editor for setup pushed a single suite run past the API's 600-requests-per-
 * minute limit, and this spec is about the execution UI, not about authoring.
 */
async function apiCall(page: Page, path: string, init?: { method?: string; data?: unknown }) {
  const response = await page.request.fetch(`http://localhost:3001${path}`, {
    method: init?.method ?? "GET",
    ...(init?.data ? { data: init.data } : {}),
  });
  expect(response.ok(), `${path} -> ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

interface Fixture {
  workspaceId: string;
  projectId: string;
  scenarioId: string;
}

/**
 * A record only receives a project key once it belongs to a project, and a test is
 * only runnable once it owns test steps, so both are established up front.
 */
async function seedRunnableTest(page: Page, code: string): Promise<Fixture> {
  const [organization] = await apiCall(page, "/organizations");
  const [workspace] = await apiCall(page, `/organizations/${organization.id}/workspaces`);
  const project = await apiCall(page, `/workspaces/${workspace.id}/projects`, {
    method: "POST",
    data: { name: `${code} programme`, code },
  });
  const document = await apiCall(page, `/workspaces/${workspace.id}/documents`, {
    method: "POST",
    data: { title: "Release verification", documentType: "test" },
  });
  const scenario = await apiCall(page, `/documents/${document.id}/rows`, {
    method: "POST",
    data: { rowType: "test_case", title: "Login flow" },
  });
  for (const title of ["Open login page", "Enter valid credentials"]) {
    await apiCall(page, `/documents/${document.id}/rows`, {
      method: "POST",
      data: { rowType: "test_step", title, parentId: scenario.id },
    });
  }
  return { workspaceId: workspace.id, projectId: project.id, scenarioId: scenario.id };
}

test("test executions are created from the test area and summarised by the plan report", async ({ page }) => {
  await registerWorkspace(page, "test-executions", "Execution Reporter");
  const fixture = await seedRunnableTest(page, "VER");

  await page.goto("/tests/executions");
  await expect(page.getByTestId("executions-table")).toHaveCount(0);

  await page.getByTestId("open-create-execution").click();
  const dialog = page.getByTestId("create-execution-dialog");
  await expect(dialog).toBeVisible();

  // The dialog must stay inside the viewport, not open off-screen.
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  if (box && viewport) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }

  const candidate = dialog.locator('[data-testid^="execution-candidate-"]').first();
  await expect(candidate).toBeVisible();
  await expect(candidate).toContainText("2 ad\u0131m");
  await candidate.click();
  await page.getByTestId("execution-environment").fill("Staging");
  await page.getByTestId("execution-build").fill("1.0.0");
  await page.getByTestId("execution-iteration").fill("Sprint 1");
  await page.getByTestId("submit-create-execution").click();

  await expect(dialog).toBeHidden();
  const rows = page.getByTestId("executions-table").locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Staging");
  await expect(rows.first()).toContainText("Plans\u0131z");
  // Every execution is issued a project key like every other record.
  await expect(rows.first().locator("td").first()).toHaveText(/^VER-\d+$/);

  await expect(page.getByTestId("executions-status-bar")).toBeVisible();
  await page.getByTestId("execution-status-filter-passed").click();
  await expect(page.getByTestId("executions-table")).toHaveCount(0);
  await page.getByTestId("execution-status-filter-passed").click();
  await expect(page.getByTestId("executions-table")).toBeVisible();

  // The plan is prepared through the API so the spec stays about the report.
  const plan = await apiCall(page, `/projects/${fixture.projectId}/test-plans`, {
    method: "POST",
    data: { name: "Release readiness", environment: "Staging" },
  });
  await apiCall(page, `/test-plans/${plan.id}/items`, {
    method: "POST",
    data: { testCaseRowId: fixture.scenarioId, iteration: "Sprint 1" },
  });

  // Client-side navigation via the sidebar, which also covers the section link and
  // avoids re-running the whole shell bootstrap the way a full reload would.
  await page.getByTestId("tests-nav-report").click();
  await expect(page.getByTestId("plan-execution-report")).toBeVisible();
  await expect(page.getByTestId("report-metrics")).toContainText("Planlanan testler");
  await expect(page.getByTestId("report-status-bar")).toBeVisible();
  // A plan whose only test has never run reports zero completion.
  await expect(page.getByTestId("report-completion")).toHaveText("0%");
  await expect(page.getByTestId("report-status-bar-not_run")).toBeVisible();

  const start = page.locator('[data-testid^="report-start-"]').first();
  await expect(start).toHaveText(/Ko\u015fumu ba\u015flat/);
  await start.click();
  await expect(start).toHaveText(/Yeniden test et/);
  await expect(page.getByTestId("report-status-bar-running")).toBeVisible();
});
