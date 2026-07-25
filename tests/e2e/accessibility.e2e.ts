import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { dismissOnboarding } from "./helpers";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

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
  await dismissOnboarding(page);

  const workspaceAudit = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(workspaceAudit.violations).toEqual([]);

  await page.setViewportSize({ width: 760, height: 900 });
  await expect(page.locator("aside[data-responsive-collapsed='true']")).toBeVisible();
  await expect(page.getByTestId("tree-section")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByTestId("nav-settings-menu").click();
  await page.getByTestId("menuitem-settings-workspace").click();
  await page.getByTestId("interface-scale-125").click();
  await page.getByTestId("settings-tab-accessibility").click();
  await page.getByTestId("setting-high-contrast").check();
  await page.getByTestId("setting-reduce-motion").check();
  await expect(page.locator("html")).toHaveClass(/docsys-high-contrast/);
  await expect(page.locator("html")).toHaveClass(/docsys-reduce-motion/);
  await expect(page.locator("html")).toHaveCSS("font-size", "20px");

  const accessibilityPreferencesAudit = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(accessibilityPreferencesAudit.violations).toEqual([]);
});
