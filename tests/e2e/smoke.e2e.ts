import { expect, test } from "@playwright/test";
import { createTreeNode, dismissOnboarding, openTreeDocument } from "./helpers";

test("register, bootstrap tenant, create document, edit hierarchical rows", async ({ page }) => {
  const suffix = Date.now();

  await page.goto("/login");
  await page.getByTestId("auth-toggle").click();
  await page.getByTestId("auth-display-name").fill("E2E User");
  await page.getByTestId("auth-email").fill(`e2e-${suffix}@example.com`);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();

  await page.getByTestId("bootstrap-org-name").fill("E2E Org");
  await page.getByTestId("bootstrap-workspace-name").fill("Main Area");
  await page.getByTestId("bootstrap-submit").click();
  await dismissOnboarding(page);

  for (const menu of ["file", "edit"]) {
    await page.getByTestId(`menu-${menu}`).click();
    await expect(page.getByTestId(`menu-${menu}-popover`)).toBeVisible();
    await page.getByTestId(`menu-${menu}`).click();
  }

  await expect(page.getByTestId("tree-empty")).toBeVisible();

  await createTreeNode(page, "menu-newDocument", "Requirements Doc");

  await openTreeDocument(page, "Requirements Doc");
  await expect(page.getByTestId("grid-empty")).toBeVisible();

  await page.locator("main .overflow-auto").click({ button: "right" });
  await page.getByTestId("menu-heading").click();
  await expect(page.getByTestId("grid-row-1")).toBeVisible();

  await page.getByTestId("grid-row-1").click({ button: "right" });
  await page.getByTestId("menu-requirement").click();
  await expect(page.getByTestId("grid-row-1.1")).toBeVisible();
  await expect(page.getByTestId("grid-row-1.1").getByTestId("cell-value-requirementNo")).toHaveText("REQ-001");

  await page.getByTestId("grid-row-1").click();
  await page.getByTestId("grid-row-1.1").click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("bulk-delete")).toBeVisible();
  await page.keyboard.press("Escape");

  const childTitle = page.getByTestId("grid-row-1.1").getByTestId("cell-value-title");
  await childTitle.click();
  await expect(page.getByTestId("row-detail-primary")).toBeHidden();
  await page.getByTestId("grid-row-1.1").click({ button: "right" });
  await expect(page.getByTestId("menu-addObject")).toBeVisible();
  await page.getByTestId("menu-detail").click();
  await expect(page.getByTestId("row-detail-primary")).toBeVisible();
  await expect(page.getByTestId("detail-description")).toBeVisible();

  await childTitle.dblclick();
  await page.getByTestId("cell-input-title").fill("System requirement");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("grid-row-1.1").getByTestId("cell-value-title")).toHaveText("System requirement");

  await page.getByTestId("menu-file").click();
  await page.getByTestId("menuitem-analysis").click();
  await page.getByTestId("menuitem-readiness").click();
  await expect(page.getByTestId("release-readiness-panel")).toBeVisible();
  await expect(page.getByTestId("readiness-status")).toHaveAttribute("data-status", "blocked");
  await expect(page.getByTestId("readiness-gate-traceability")).toHaveAttribute("data-status", "failed");
  await page.getByTestId("close-reports").click();

  const idHeader = page.getByTestId("column-header-number");
  const requirementHeader = page.getByTestId("column-header-requirementNo");
  const idBefore = await idHeader.boundingBox();
  const requirementBefore = await requirementHeader.boundingBox();
  await page.getByTestId("document-grid-scroll").evaluate((element) => { element.scrollLeft = 240; });
  const idAfter = await idHeader.boundingBox();
  const requirementAfter = await requirementHeader.boundingBox();
  expect((idBefore?.x ?? 0) - (idAfter?.x ?? 0)).toBeGreaterThan(20);
  expect((requirementBefore?.x ?? 0) - (requirementAfter?.x ?? 0)).toBeGreaterThan(20);

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("document-font-size").selectOption("18");
  await page.getByTestId("document-font-family").selectOption("serif");
  await expect(page.getByTestId("document-font-preview")).toHaveCSS("font-size", "18px");
  await page.getByTestId("close-workspace-settings").click();
  await expect(page.getByTestId("grid-row-1")).toHaveCSS("font-size", "18px");

  await page.getByTestId("global-search-input").fill("REQ-001");
  await expect(page.getByTestId("global-search-results")).toContainText("System requirement");
  const searchBounds = await page.getByTestId("global-search-trigger").boundingBox();
  const resultBounds = await page.getByTestId("global-search-results").boundingBox();
  expect(Math.abs((searchBounds?.x ?? 0) - (resultBounds?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((searchBounds?.width ?? 0) - (resultBounds?.width ?? 0))).toBeLessThanOrEqual(1);
  await page.getByTestId("global-search-input").press("Escape");

  await expect(page.getByTestId("presence-count")).toContainText(": 1");

  await page.getByTestId("nav-trash").click();
  await expect(page.getByTestId("trash-panel")).toBeVisible();
  await page.getByTestId("nav-documents").click();

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("language-en").click();
  await expect(page.getByRole("button", { name: "Documents" })).toBeVisible();
  await page.getByTestId("language-tr").click();
  await expect(page.getByRole("button", { name: "Documents" })).toBeHidden();
});
