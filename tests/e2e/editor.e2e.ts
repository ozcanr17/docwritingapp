import { expect, test } from "@playwright/test";
import { createTreeNode, openTreeDocument } from "./helpers";

test("collaborative rich-text document persists across reloads", async ({ page }) => {
  const suffix = Date.now();

  await page.goto("/login");
  await page.getByTestId("auth-toggle").click();
  await page.getByTestId("auth-display-name").fill("Editor User");
  await page.getByTestId("auth-email").fill(`editor-${suffix}@example.com`);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();

  await page.getByTestId("bootstrap-org-name").fill("Editor Org");
  await page.getByTestId("bootstrap-workspace-name").fill("Main");
  await page.getByTestId("bootstrap-submit").click();
  await expect(page.getByTestId("tree-empty")).toBeVisible();

  await createTreeNode(page, "menu-newTextDocument", "Design Notes");

  await openTreeDocument(page, "Design Notes");
  await expect(page.getByTestId("richtext-surface")).toBeVisible();
  await expect(page.getByTestId("collab-status")).toHaveClass(/bg-success/, { timeout: 15000 });

  const marker = `collab-${suffix}`;
  await page.getByTestId("richtext-surface").click();
  await page.keyboard.type(marker);
  await expect(page.getByTestId("richtext-surface")).toContainText(marker);

  await page.waitForTimeout(3000);
  await page.reload();

  await openTreeDocument(page, "Design Notes");
  await expect(page.getByTestId("richtext-surface")).toContainText(marker, { timeout: 15000 });
});
