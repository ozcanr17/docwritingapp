import { expect, test } from "@playwright/test";
import { createTreeNode } from "./helpers";

test("split panes keep their positions and align editor bars while focus changes", async ({ page }) => {
  const suffix = Date.now();
  await page.goto("/login");
  await page.getByTestId("auth-toggle").click();
  await page.getByTestId("auth-display-name").fill("Split User");
  await page.getByTestId("auth-email").fill(`split-${suffix}@example.com`);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();
  await page.getByTestId("bootstrap-org-name").fill("Split Org");
  await page.getByTestId("bootstrap-workspace-name").fill("Main");
  await page.getByTestId("bootstrap-submit").click();

  await createTreeNode(page, "menu-newDocument", "Left Spec");
  await createTreeNode(page, "menu-newTestDocument", "Right Tests");
  await page.getByRole("tab", { name: "Left Spec" }).click({ button: "right" });
  await page.getByTestId("menu-split").click();

  const primary = page.getByTestId("document-pane-primary");
  const secondary = page.getByTestId("document-pane-secondary");
  await expect(primary).toHaveAttribute("data-focused", "false");
  await expect(secondary).toHaveAttribute("data-focused", "true");
  await expect(primary).toHaveAttribute("data-document-id", /.+/);
  await expect(secondary).toHaveAttribute("data-document-id", /.+/);
  const primaryId = await primary.getAttribute("data-document-id");
  const secondaryId = await secondary.getAttribute("data-document-id");
  expect(primaryId).not.toBe(secondaryId);

  const primaryTop = (await primary.getByTestId("add-object").boundingBox())?.y;
  const secondaryTop = (await secondary.getByTestId("add-object").boundingBox())?.y;
  expect(Math.abs((primaryTop ?? 0) - (secondaryTop ?? 0))).toBeLessThanOrEqual(1);

  const activeFilter = page.locator('[data-testid="advanced-filter-toggle"]:visible');
  await activeFilter.click();
  await expect(page.getByTestId("advanced-filter-popover")).toBeVisible();
  await activeFilter.click();

  const handle = page.getByTestId("split-resize-handle");
  await expect(handle).toHaveAttribute("aria-orientation", "vertical");
  const beforeResize = await primary.boundingBox();
  await handle.focus();
  await handle.press("ArrowRight");
  const afterResize = await primary.boundingBox();
  expect((afterResize?.width ?? 0) - (beforeResize?.width ?? 0)).toBeGreaterThan(20);

  await page.getByRole("tab", { name: "Right Tests" }).click({ button: "right" });
  await page.getByTestId("menu-split-vertical").click();
  await expect(handle).toHaveAttribute("aria-orientation", "horizontal");

  await primary.click();
  await expect(primary).toHaveAttribute("data-focused", "true");
  await expect(primary).toHaveAttribute("data-document-id", primaryId ?? "");
  await expect(secondary).toHaveAttribute("data-document-id", secondaryId ?? "");
  await secondary.click();
  await expect(secondary).toHaveAttribute("data-focused", "true");
  await expect(primary).toHaveAttribute("data-document-id", primaryId ?? "");
  await expect(secondary).toHaveAttribute("data-document-id", secondaryId ?? "");
});
