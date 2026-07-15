import { expect, test } from "@playwright/test";

test("desktop login accepts an empty server address and a local username", async ({ page, request }) => {
  const username = `desktop-${Date.now()}`;
  const registration = await request.post("http://127.0.0.1:3001/auth/register", {
    data: { email: `${username}@docsys.local`, displayName: "Desktop User", password: "password-123" },
  });
  expect(registration.ok()).toBeTruthy();

  await page.goto("/login");
  await expect(page.getByTestId("auth-server-address")).toHaveValue("");
  await page.getByTestId("auth-email").fill(username);
  await page.getByTestId("auth-password").fill("password-123");
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("bootstrap-org-name")).toBeVisible();
});
