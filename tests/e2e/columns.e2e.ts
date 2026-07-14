import { expect, test } from "@playwright/test";

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

  // A test document imported with a test case + steps (expected result column).
  page.once("dialog", (dialog) => void dialog.accept("Test Plan"));
  await page.locator("section").click({ button: "right" });
  await page.getByTestId("menu-newDocument").click();
  await page.getByRole("button", { name: "Test Plan" }).click();

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

  // The expected-result column exists for test steps; edit it inline.
  const stepRow = page.getByTestId("grid-row-1.1");
  const expectedCell = stepRow.getByTestId("cell-value-expectedResult");
  await expectedCell.click();
  await expectedCell.press("Enter");
  await page.getByTestId("cell-input-expectedResult").fill("Login page is displayed");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Login page is displayed")).toBeVisible();

  // Add a custom column via Insert menu (column name, then type).
  const answers = ["Coverage", "text"];
  page.on("dialog", (d) => void d.accept(answers.shift() ?? ""));
  await page.getByTestId("menu-insert").click();
  await page.getByTestId("menuitem-add-column").click();
  await expect(page.getByText("Coverage", { exact: true })).toBeVisible();
});
