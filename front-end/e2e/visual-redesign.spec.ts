import { expect, test } from "@playwright/test";

test("theme choice is accessible and persists between locales", async ({ page }) => {
  await page.goto("/en");
  const toggle = page.getByRole("button", { name: "Switch to dark theme" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Switch to light theme" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/am");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "ወደ ብርሃን ገጽታ ይቀይሩ" })).toBeVisible();
});

test("mobile dashboard navigation supports screen readers and Escape", async ({ page }) => {
  const user = {
    id: 1,
    name: "Site Administrator",
    email: "admin@example.invalid",
    role: "admin",
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let response: unknown = { items: [], page: 1, limit: 3, total: 0 };
    if (url.pathname.endsWith("/me") || url.pathname.endsWith("/refresh")) {
      response = { user };
    } else if (url.pathname.endsWith("/users")) {
      response = [];
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/en/dashboard");

  const navigation = page.locator("#dashboard-mobile-navigation");
  const toggle = page.getByRole("button", { name: "Open dashboard navigation" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
  await expect(page.getByRole("button", { name: "Open dashboard navigation" })).toBeFocused();
});
