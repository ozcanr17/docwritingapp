import { Page } from "@playwright/test";

export async function registerWorkspace(
  page: Page,
  prefix: string,
  displayName: string,
) {
  const suffix = Date.now();
  await page.goto("/login");
  await page.getByTestId("auth-toggle").click();
  await page.getByTestId("auth-display-name").fill(displayName);
  await page
    .getByTestId("auth-email")
    .fill(`${prefix}-${suffix}@example.com`);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();
  await page.getByTestId("bootstrap-org-name").fill(`${prefix} Organization`);
  await page.getByTestId("bootstrap-workspace-name").fill("Main Workspace");
  await page.getByTestId("bootstrap-submit").click();
  await dismissOnboarding(page);
}

export async function createTreeNode(page: Page, menuTestId: string, name: string) {
  await page.getByTestId("tree-section").click({ button: "right" });
  await page.getByTestId(menuTestId).click();
  await page.getByTestId("tree-create-name").fill(name);
  await page.getByTestId("tree-create-submit").click();
}

export async function openTreeDocument(page: Page, name: string) {
  await page.getByTestId("tree-section").getByRole("button", { name, exact: true }).click();
}

export async function dismissOnboarding(page: Page) {
  const dialog = page.getByTestId("onboarding-dialog");
  const appeared = await dialog.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);
  if (appeared) {
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  }
}
