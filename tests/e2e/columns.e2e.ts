import { expect, test } from "@playwright/test";
import { createTreeNode, openTreeDocument } from "./helpers";

test("test document: add rows, edit test step fields, add a custom column", async ({ page }) => {
  const suffix = Date.now();

  await page.goto("/login");
  await page.getByTestId("auth-toggle").click();
  await page.getByTestId("auth-display-name").fill("QA User");
  await page.getByTestId("auth-email").fill(`qa-${suffix}@example.com`);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();

  await page.getByTestId("bootstrap-org-name").fill("QA Org");
  await page.getByTestId("bootstrap-workspace-name").fill("Main");
  await page.getByTestId("bootstrap-submit").click();
  await expect(page.getByTestId("tree-empty")).toBeVisible();

  await createTreeNode(page, "menu-newTestDocument", "Test Plan");
  await openTreeDocument(page, "Test Plan");

  await page.getByTestId("menubar-file-input").setInputFiles({
    name: "tests.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "level,type,title,description",
        "0,test_case,Login flow,",
        "1,test_step,Open login page,",
        "1,test_step,Enter valid credentials,",
      ].join("\n"),
      "utf8",
    ),
  });

  await expect(page.getByTestId("grid-row-1")).toBeVisible();
  await expect(page.getByTestId("grid-row-1.1")).toBeVisible();

  const stepRow = page.getByTestId("grid-row-1.1");
  const expectedCell = stepRow.getByTestId("cell-value-expectedResult");
  await expectedCell.click();
  await expectedCell.press("Enter");
  await page.getByTestId("cell-input-expectedResult").fill("Login page is displayed");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByText("Login page is displayed")).toBeVisible();

  const resultCell = stepRow.getByTestId("cell-value-testResult");
  await resultCell.click();
  await page.getByTestId("cell-input-testResult").fill("Passed");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Passed")).toBeVisible();

  await page.getByTestId("menu-insert").click();
  await page.getByTestId("menuitem-add-column").click();
  await page.getByTestId("column-name-input").fill("Coverage");
  await page.getByTestId("column-type-select").selectOption("text");
  await page.getByTestId("column-create-submit").click();
  await expect(page.getByRole("columnheader", { name: "Coverage" })).toBeVisible();

  await page.getByTestId("menu-insert").click();
  await page.getByTestId("menuitem-add-column").click();
  await page.getByTestId("column-name-input").fill("Platforms");
  await page.getByTestId("column-type-select").selectOption("multi_select");
  await page.getByTestId("column-options-input").fill("Web\niOS\nAndroid");
  await page.getByTestId("column-create-submit").click();
  const platformCell = stepRow.locator('[data-testid^="cell-value-custom:platforms_"]');
  await platformCell.scrollIntoViewIfNeeded();
  await platformCell.dblclick();
  await page.getByTestId("choice-option-0").check();
  await page.getByTestId("choice-option-1").check();
  await page.getByTestId("choice-save").click();
  await expect(platformCell).toHaveText("Web, iOS");
});
