import { expect, test } from "@playwright/test";
import { createTreeNode } from "./helpers";

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

  await expect(page.getByTestId("tree-empty")).toBeVisible();

  await createTreeNode(page, "menu-newDocument", "Requirements Doc");

  await page.getByRole("button", { name: "Requirements Doc" }).click();
  await expect(page.getByTestId("grid-empty")).toBeVisible();

  await page.locator("main .overflow-auto").click({ button: "right" });
  await page.getByTestId("menu-heading").click();
  await expect(page.getByTestId("grid-row-1")).toBeVisible();

  await page.getByTestId("grid-row-1").click({ button: "right" });
  await page.getByTestId("menu-child").click();
  await expect(page.getByTestId("grid-row-1.1")).toBeVisible();
  await expect(page.getByTestId("grid-row-1.1").getByTestId("cell-value-requirementNo")).toHaveText("REQ-001");

  await page.getByTestId("select-row-1").check();
  await page.getByTestId("select-row-1.1").check();
  await expect(page.getByTestId("bulk-delete")).toBeVisible();
  await page.getByTestId("select-row-1").uncheck();

  const childTitle = page.getByTestId("grid-row-1.1").getByTestId("cell-value-title");
  await childTitle.click();
  await expect(page.getByTestId("row-detail-primary")).toBeHidden();
  await page.getByTestId("grid-row-1.1").click({ button: "right" });
  await expect(page.getByTestId("menu-insert-2")).toBeVisible();
  await page.getByTestId("menu-detail").click();
  await expect(page.getByTestId("row-detail-primary")).toBeVisible();
  await expect(page.getByTestId("detail-description")).toBeVisible();

  await childTitle.click();
  await childTitle.press("Enter");
  await page.getByTestId("cell-input-title").fill("System requirement");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("grid-row-1.1").getByTestId("cell-value-title")).toHaveText("System requirement");

  await expect(page.getByTestId("presence-count")).toContainText(": 1");

  await page.getByTestId("nav-trash").click();
  await expect(page.getByTestId("trash-panel")).toBeVisible();
  await page.getByTestId("nav-documents").click();

  await page.getByTestId("menu-view").click();
  await page.getByTestId("menuitem-lang-en").click();
  await expect(page.getByRole("button", { name: "Documents" })).toBeVisible();
  await page.getByTestId("menu-view").click();
  await page.getByTestId("menuitem-lang-tr").click();
  await expect(page.getByRole("button", { name: "Documents" })).toBeHidden();
});
