import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("login and primary workspace have no automated WCAG A or AA violations", async ({ page }) => {
  const suffix = Date.now();
  await page.goto("/login");

  const loginAudit = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(loginAudit.violations).toEqual([]);

  await page.getByTestId("auth-toggle").click();
  await page.getByTestId("auth-display-name").fill("Accessibility User");
  await page.getByTestId("auth-email").fill(`accessibility-${suffix}@example.com`);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();
  await page.getByTestId("bootstrap-org-name").fill("Accessibility Organization");
  await page.getByTestId("bootstrap-workspace-name").fill("Main Workspace");
  await page.getByTestId("bootstrap-submit").click();
  await expect(page.getByTestId("tree-empty")).toBeVisible();

  const workspaceAudit = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(workspaceAudit.violations).toEqual([]);
});
