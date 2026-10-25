import { expect, test } from "@playwright/test";

test("dashboard shell follows the selected locale and fits mobile and desktop", async ({
  page,
}) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  expect(email, "ADMIN_EMAIL must be set").toBeTruthy();
  expect(password, "ADMIN_PASSWORD must be set").toBeTruthy();
  await page.goto("/en/auth/login");
  await page.getByLabel("Email address").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
  await page.getByRole("button", { name: "አማርኛ" }).click();
  await expect(page).toHaveURL("/am/dashboard");
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await expect(page.getByRole("heading", { name: /እንኳን ደህና መጡ/ })).toBeVisible();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
  }
  await page.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL("/en/dashboard");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
  }
});

test("logged-out dashboard access redirects to localized login", async ({ page }) => {
  await page.goto("/am/dashboard");
  await expect(page).toHaveURL(/\/am\/auth\/login(?:\?.*)?$/);
});
