import { expect, test } from "@playwright/test";

test("pilot guide, consent and administrator feedback inbox work end to end", async ({ page }) => {
  const suffix = Date.now();
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.setItem("docsys-onboarding", JSON.stringify({ state: { completed: true }, version: 1 })));
  await page.reload();
  await page.getByTestId("auth-toggle").click();
  await page.getByTestId("auth-display-name").fill("Pilot Administrator");
  await page.getByTestId("auth-email").fill(`pilot-${suffix}@example.com`);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();
  await page.getByTestId("bootstrap-org-name").fill("Pilot Org");
  await page.getByTestId("bootstrap-workspace-name").fill("Pilot Workspace");
  await page.getByTestId("bootstrap-submit").click();
  await expect(page.getByTestId("tree-empty")).toBeVisible();

  await page.getByTestId("menu-file").click();
  await page.getByTestId("menuitem-help").click();
  await page.getByTestId("menuitem-pilot-checklist").click();
  await page.getByTestId("pilot-check-roles").click();
  await page.keyboard.press("Escape");

  await page.getByTestId("menu-file").click();
  await page.getByTestId("menuitem-help").click();
  await page.getByTestId("menuitem-pilot-feedback").click();
  await page.getByTestId("feedback-category").selectOption("usability");
  await page.getByTestId("feedback-title").fill("First project flow");
  await page.getByTestId("feedback-description").fill("The pilot checklist provides a clear path for the first controlled project.");
  await page.getByTestId("pilot-telemetry-consent").check();
  await page.getByTestId("submit-pilot-feedback").click();
  await expect(page.getByTestId("pilot-feedback-dialog")).toBeHidden();

  await page.getByTestId("nav-admin").click();
  await expect(page.getByText("First project flow")).toBeVisible();
});
