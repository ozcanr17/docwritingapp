import { expect, test } from "@playwright/test";
import { registerWorkspace } from "./helpers";

test("project managers can update, archive and restore a project", async ({ page }) => {
  await registerWorkspace(page, "project-lifecycle", "Project Lifecycle Administrator");
  await page.getByTestId("workspace-focus-tester").click();
  await page.getByTestId("workspace-focus-action").click();

  await page.getByTestId("open-create-project").click();
  await page.getByTestId("project-name").fill("Verification project");
  await page.getByTestId("project-code").fill("VERIFY");
  await page.getByTestId("create-project").click();
  await expect(page.getByTestId("project-selector")).toContainText("VERIFY");

  await page.getByTestId("open-project-settings").click();
  await page.getByTestId("project-settings-name").fill("Verification program");
  await page.getByTestId("save-project-settings").click();
  await expect(page.getByRole("status")).toContainText("kaydedildi");
  await page.getByRole("button", { name: "Projeyi ar\u015fivle" }).click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Projeyi ar\u015fivle" }).click();

  await expect(confirmation).toBeHidden();
  const restore = page.getByRole("button", { name: "Geri a\u00e7" });
  await expect(restore).toBeVisible();
  await restore.click();
  await page.getByRole("button", { name: "Kapat" }).click();
  await expect(page.getByTestId("project-selector")).toContainText("Verification program");

  await page.getByTestId("open-workflow-editor").click();
  await page.getByTestId("workflow-preset-controlled").click();
  await expect(page.getByTestId("workflow-preset-pending")).toBeVisible();
  await page.getByTestId("save-workflow").click();
  await expect(page.getByTestId("dialog-frame")).toBeHidden();
});
