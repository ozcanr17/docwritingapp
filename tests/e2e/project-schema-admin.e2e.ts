import { expect, test } from "@playwright/test";
import { registerWorkspace } from "./helpers";

test("administrators configure work item types and fields per project", async ({ page }) => {
  await registerWorkspace(page, "schema-admin", "Schema Administrator");

  await page.goto("/admin/projects");
  await page.getByTestId("admin-create-project").click();
  await page.getByTestId("project-name").fill("Schema program");
  await page.getByTestId("project-code").fill("SCH");
  await page.getByTestId("create-project").click();
  await expect(page.getByTestId("admin-project-SCH")).toBeVisible();
  await expect(page.getByTestId("project-schema-admin")).toBeVisible();

  for (const key of ["epic", "story", "task", "bug", "risk"]) {
    await expect(page.getByTestId(`schema-type-${key}`)).toBeVisible();
  }
  await expect(page.getByTestId("archive-type-task")).toHaveCount(0);

  await page.getByTestId("new-type-name").fill("Change request");
  await page.getByTestId("new-type-base").selectOption("task");
  await page.getByTestId("submit-new-type").click();
  const customType = page.getByTestId("schema-type-change_request");
  await expect(customType).toBeVisible();
  await expect(customType).toContainText("Change request");

  await page.getByTestId("new-field-label").fill("Impact area");
  await page.getByTestId("new-field-type").selectOption("single_select");
  await page.getByTestId("new-field-required").check();
  await page.getByTestId("new-field-options").fill("API\nWeb\nDesktop");
  await page.getByTestId("applies-to-change_request").click();
  await page.getByTestId("submit-new-field").click();

  const field = page.getByTestId("schema-field-impact_area");
  await expect(field).toBeVisible();
  await expect(field).toContainText("API, Web, Desktop");
  await expect(field).toContainText("change_request");

  await page.getByTestId("archive-field-impact_area").click();
  await expect(page.getByTestId("schema-field-impact_area")).toHaveCount(0);
  await page.getByTestId("archive-type-change_request").click();
  await expect(page.getByTestId("schema-type-change_request")).toHaveCount(0);
});
