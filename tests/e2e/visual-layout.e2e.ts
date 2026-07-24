import { expect, test } from "@playwright/test";
import {
  createTreeNode,
  openTreeDocument,
  registerWorkspace,
} from "./helpers";

test("workspace, detail overlay and split layouts remain visually stable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await registerWorkspace(page, "visual", "Visual Regression Administrator");
  const profileMask = page.getByTestId("open-profile");
  await expect(page).toHaveScreenshot("workspace-wide.png", {
    mask: [profileMask],
  });

  await createTreeNode(page, "menu-newDocument", "Visual Specification");
  await openTreeDocument(page, "Visual Specification");
  await page.locator("main .overflow-auto").click({ button: "right" });
  await page.getByTestId("menu-heading").click();
  await page.getByTestId("grid-row-1").click({ button: "right" });
  await page.getByTestId("menu-detail").click();
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(page.getByTestId("detail-panel")).toHaveAttribute(
    "data-overlay",
    "true",
  );
  await expect(page).toHaveScreenshot("detail-overlay.png", {
    mask: [profileMask],
  });
  await page.keyboard.press("Escape");
  await page.getByTestId("close-document-overview").click();
  await expect(page.getByTestId("detail-panel")).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  await createTreeNode(page, "menu-newTestDocument", "Visual Test Plan");
  const tabs = page.locator('[data-testid^="document-tab-"]');
  await expect(tabs).toHaveCount(2);
  await tabs.first().click({ button: "right" });
  await page.getByTestId("menu-split").click();
  await expect(page.getByTestId("document-pane-secondary")).toBeVisible();
  await page.waitForTimeout(150);
  if (await page.getByTestId("detail-panel").isVisible()) {
    await page.getByTestId("close-document-overview").click();
  }
  await expect(page.getByTestId("detail-panel")).toBeHidden();
  await expect(page).toHaveScreenshot("split-horizontal.png", {
    mask: [profileMask],
  });

  await page.setViewportSize({ width: 760, height: 900 });
  await expect(page.getByTestId("document-split-container")).toHaveAttribute(
    "data-responsive-stacked",
    "true",
  );
  await expect(page).toHaveScreenshot("split-narrow-stacked.png", {
    mask: [profileMask],
  });
});
