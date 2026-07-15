import { expect, test } from "@playwright/test";
import { createTreeNode } from "./helpers";

test("suspect links and baseline diff", async ({ page }) => {
  const suffix = Date.now();

  await page.goto("/login");
  await page.getByTestId("auth-toggle").click();
  await page.getByTestId("auth-display-name").fill("Trace User");
  await page.getByTestId("auth-email").fill(`trace-${suffix}@example.com`);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();

  await page.getByTestId("bootstrap-org-name").fill("Trace Org");
  await page.getByTestId("bootstrap-workspace-name").fill("Main");
  await page.getByTestId("bootstrap-submit").click();
  await expect(page.getByTestId("tree-empty")).toBeVisible();

  await createTreeNode(page, "menu-newDocument", "Spec");
  await page.locator("section").getByRole("button", { name: "Spec", exact: true }).click();

  await page.getByTestId("menubar-file-input").setInputFiles({
    name: "spec.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      ["level,type,title,description", "0,requirement,Requirement A,"].join("\n"),
      "utf8",
    ),
  });
  await expect(page.getByTestId("grid-row-1")).toBeVisible();

  await createTreeNode(page, "menu-newTestDocument", "Tests");
  await page.locator("section").getByRole("button", { name: "Tests", exact: true }).click();
  await page.getByTestId("menubar-file-input").setInputFiles({
    name: "tests.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(["level,type,title,description", "0,test_case,Test B,"].join("\n"), "utf8"),
  });
  await expect(page.getByTestId("grid-row-1")).toBeVisible();

  // Get the requirement's row id to link the test to it.
  const requirementId = await page.evaluate(async () => {
    const res = await fetch("http://localhost:3001/organizations", { credentials: "include" });
    const orgs = await res.json();
    const wsRes = await fetch(`http://localhost:3001/organizations/${orgs[0].id}/workspaces`, { credentials: "include" });
    const ws = await wsRes.json();
    const treeRes = await fetch(`http://localhost:3001/workspaces/${ws[0].id}/tree`, { credentials: "include" });
    const tree = await treeRes.json();
    const docId = tree.documents.find((document: { title: string }) => document.title === "Spec").id;
    const outlineRes = await fetch(`http://localhost:3001/documents/${docId}/outline`, { credentials: "include" });
    const outline = await outlineRes.json();
    return outline.find((r: { rowType: string }) => r.rowType === "requirement").id as string;
  });

  // Select the test case, add a verifying link to the requirement.
  await page.getByTestId("grid-row-1").click({ button: "right" });
  await page.getByTestId("menu-detail").click();
  await expect(page.getByTestId("row-detail-primary")).toBeVisible();
  await page.getByTestId("link-target").fill(requirementId);
  await page.getByTestId("link-add").click();
  await expect(page.getByTestId("open-linked")).toBeVisible();
  await expect(page.getByTestId("grid-row-1").getByTestId("cell-value-linkedRequirements")).toContainText("REQ-001 : Requirement A");

  // Create a baseline via the Analysis menu.
  await page.getByTestId("menu-analysis").click();
  await page.getByTestId("menuitem-baselines").click();
  await expect(page.getByTestId("reports-dialog")).toBeVisible();
  await page.getByTestId("create-baseline").click();
  await page.getByTestId("baseline-label-input").fill("Release 1");
  await page.getByTestId("baseline-create-submit").click();
  await expect(page.getByTestId("diff-baseline-1")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reports-dialog")).toBeHidden();

  // Change the requirement -> its link should become suspect.
  await page.locator("section").getByRole("button", { name: "Spec", exact: true }).click();
  const reqTitle = page.getByTestId("grid-row-1").getByTestId("cell-value-title");
  await reqTitle.click();
  await reqTitle.press("Enter");
  await page.getByTestId("cell-input-title").fill("Requirement A (changed)");
  await page.keyboard.press("Enter");

  // Open the test case detail again; its link is now suspect.
  await page.locator("section").getByRole("button", { name: "Tests", exact: true }).click();
  await page.getByTestId("grid-row-1").click({ button: "right" });
  await page.getByTestId("menu-detail").click();
  await expect(page.getByTestId("suspect-badge")).toBeVisible();
  await page.getByTestId("acknowledge-link").click();
  await expect(page.getByTestId("suspect-badge")).toBeHidden();
});
