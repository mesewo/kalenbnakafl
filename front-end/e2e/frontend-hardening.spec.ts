import { expect, test } from "@playwright/test";

const testUser = {
  id: 1,
  name: "Test Admin",
  email: "admin@example.org",
  role: "admin" as const,
};

async function mockAdminSession(page: import("@playwright/test").Page) {
  await page.route("**/api/me*", (route) => route.fulfill({ json: { user: testUser } }));
  await page.route("**/api/refresh*", (route) => route.fulfill({ json: { user: testUser } }));
}

test("security headers are present without public or dashboard CSP violations", async ({
  page,
}) => {
  await mockAdminSession(page);
  const cspViolations: string[] = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) cspViolations.push(message.text());
  });

  const publicResponse = await page.goto("/en");
  expect(publicResponse).not.toBeNull();
  expectSecurityHeaders(publicResponse!.headers());
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/kalenbnakafl-logo.jpg");

  const dashboardResponse = await page.goto("/en/dashboard");
  expect(dashboardResponse).not.toBeNull();
  expectSecurityHeaders(dashboardResponse!.headers());
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(cspViolations).toEqual([]);
});

function expectSecurityHeaders(headers: Record<string, string>) {
  expect(headers["strict-transport-security"]).toContain("max-age=31536000");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
}

test("login shows the localized wake-up state and retries a slow 503", async ({ page }) => {
  await page.route("**/api/me*", (route) => route.fulfill({ json: { user: null }, status: 401 }));
  await page.route("**/api/refresh*", (route) =>
    route.fulfill({
      json: { error: { code: "unauthorized", message: "Unauthorized" } },
      status: 401,
    }),
  );
  let loginAttempts = 0;
  await page.route("**/api/login*", async (route) => {
    loginAttempts += 1;
    if (loginAttempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "service_unavailable", message: "Unavailable", details: {} },
        }),
      });
      return;
    }
    await route.fulfill({ json: { user: testUser } });
  });

  await page.goto("/en/auth/login");
  await page.getByLabel("Email address").fill(testUser.email);
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("status")).toContainText("The server is waking up, trying again…");
  await expect.poll(() => loginAttempts).toBeGreaterThanOrEqual(2);
});
