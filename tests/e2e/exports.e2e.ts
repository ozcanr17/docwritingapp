import { expect, test } from "@playwright/test";
import { createTreeNode, openTreeDocument } from "./helpers";

test("import CSV, verify hierarchy, then export and download", async ({ page }) => {
  const suffix = Date.now();

  await page.goto("/login");
  await page.getByTestId("auth-toggle").click();
  await page.getByTestId("auth-display-name").fill("Export User");
  await page.getByTestId("auth-email").fill(`exp-${suffix}@example.com`);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();

  await page.getByTestId("bootstrap-org-name").fill("Export Org");
  await page.getByTestId("bootstrap-workspace-name").fill("Main");
  await page.getByTestId("bootstrap-submit").click();
  await expect(page.getByTestId("tree-empty")).toBeVisible();

  await createTreeNode(page, "menu-newDocument", "Imported Spec");
  await openTreeDocument(page, "Imported Spec");
  await expect(page.getByTestId("grid-empty")).toBeVisible();

  const csv = [
    "level,type,title,description",
    "0,heading,Introduction,",
    "1,requirement,User can log in,Valid credentials",
    "1,requirement,Password rules,",
    "0,heading,Scope,",
  ].join("\n");

  await page.getByTestId("menubar-file-input").setInputFiles({
    name: "spec.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });

  await expect(page.getByTestId("grid-row-1.1")).toBeVisible();
  await expect(page.getByText("User can log in")).toBeVisible();
  await expect(page.getByTestId("grid-row-2")).toBeVisible();

  await page.getByTestId("menu-file").click();
  await page.getByTestId("menuitem-export").click();
  await page.getByTestId("menuitem-export-csv").click();
  await expect(page.getByTestId("toast-success")).toBeVisible({ timeout: 45000 });
});
