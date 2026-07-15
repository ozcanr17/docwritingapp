import { Page } from "@playwright/test";

export async function createTreeNode(page: Page, menuTestId: string, name: string) {
  await page.locator("section").click({ button: "right" });
  await page.getByTestId(menuTestId).click();
  await page.getByTestId("tree-create-name").fill(name);
  await page.getByTestId("tree-create-submit").click();
}
