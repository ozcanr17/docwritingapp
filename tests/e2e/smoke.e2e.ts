import { expect, test } from "@playwright/test";

test("register, bootstrap tenant, create document, edit hierarchical rows", async ({ page }) => {
  const suffix = Date.now();

  await page.goto("/login");
  await page.getByRole("button", { name: "Kayit ol" }).click();
  await page.getByLabel("Ad Soyad").fill("E2E Kullanici");
  await page.getByLabel("E-posta").fill(`e2e-${suffix}@example.com`);
  await page.getByLabel("Parola").fill("password-123");
  await page.getByRole("button", { name: "Kayit ol" }).click();

  await page.getByLabel("Organizasyon adi").fill("E2E Org");
  await page.getByLabel("Calisma alani adi").fill("Ana Alan");
  await page.getByRole("button", { name: "Organizasyon olustur" }).click();

  await expect(page.getByText("Henuz klasor veya dokuman yok.")).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept("Gereksinim Dokumani"));
  await page.locator("section").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Yeni dokuman" }).click();

  await page.getByRole("button", { name: "Gereksinim Dokumani" }).click();
  await expect(page.getByText("Bu dokuman henuz bos", { exact: false })).toBeVisible();

  await page.locator("main .overflow-auto").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Baslik ekle" }).click();
  await expect(page.getByTestId("grid-row-1")).toBeVisible();

  await page.getByTestId("grid-row-1").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Alt satir ekle" }).click();
  await expect(page.getByTestId("grid-row-1.1")).toBeVisible();

  const childTitle = page.getByTestId("grid-row-1.1").getByRole("button");
  await childTitle.dblclick();
  await page.keyboard.type("Sistem gereksinimi");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Sistem gereksinimi")).toBeVisible();

  await expect(page.getByText("Cevrimici: 1")).toBeVisible();
});
