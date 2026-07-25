import { expect, test } from "@playwright/test";
import {
  createTreeNode,
  openTreeDocument,
  registerWorkspace,
} from "./helpers";

test("author, tester, reviewer and administrator entry points stay task focused", async ({
  page,
}) => {
  await registerWorkspace(page, "roles", "Role Workflow Administrator");

  await expect(page.getByTestId("workspace-focus-author")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await createTreeNode(page, "menu-newDocument", "Review Specification");
  await openTreeDocument(page, "Review Specification");

  const activeTab = page.locator('[data-testid^="document-tab-"]').first();
  const documentId = (await activeTab.getAttribute("data-testid"))?.replace(
    "document-tab-",
    "",
  );
  expect(documentId).toBeTruthy();
  await page.getByTestId(`close-document-tab-${documentId}`).click();

  await page.getByTestId("workspace-focus-tester").click();
  await expect(page.getByTestId("workspace-focus-tester")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByTestId("workspace-focus-action").click();
  await expect(page.getByTestId("open-create-project")).toBeVisible();

  await page.getByTestId("nav-documents").click();
  await page.getByTestId("menuitem-documents-all").click();
  await page.getByTestId("workspace-focus-reviewer").click();
  await expect(page.getByTestId("workspace-focus-reviewer")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByTestId("workspace-focus-action").click();
  await expect(page.getByTestId(`document-tab-${documentId}`)).toBeVisible();

  await page.getByTestId("nav-settings-menu").click();
  await page.getByTestId("menuitem-settings-admin").click();
  await expect(page.getByTestId("admin-panel")).toBeVisible();
  await page.getByTestId("admin-tab-users").click();
  await expect(page.getByTestId("admin-tab-users")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByTestId("admin-tab-audit").click();
  await expect(page.getByTestId("admin-tab-audit")).toHaveAttribute(
    "aria-current",
    "page",
  );
});
