import { Page } from "@playwright/test";

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
