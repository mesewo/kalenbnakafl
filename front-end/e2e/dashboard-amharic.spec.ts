import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import en from "../messages/en.json";
import am from "../messages/am.json";
import { waitForPublicContent } from "./helpers/public-content";

const dashboard = am.dashboard;

async function login(
  page: Page,
  locale: "en" | "am",
  email = process.env.ADMIN_EMAIL!,
  password = process.env.ADMIN_PASSWORD!,
) {
  await page.goto(`/${locale}/auth/login`);
  const catalog = locale === "am" ? am : en;
  await page.getByLabel(catalog.auth.email).fill(email);
  await page.getByLabel(catalog.auth.password).fill(password);
  await page.getByRole("button", { name: catalog.auth.login }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard`));
}

test("Amharic admin creates, publishes, edits, and deletes translated posts and events", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = createTestSuffix(testInfo);
  expect(process.env.ADMIN_EMAIL, "ADMIN_EMAIL must be set").toBeTruthy();
  expect(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD must be set").toBeTruthy();
  const postTitle = `የፈተና ጽሑፍ ${suffix}`;
  const postTitleEdited = `የተሻሻለ ጽሑፍ ${suffix}`;
  const eventTitle = `የፈተና ዝግጅት ${suffix}`;
  const eventTitleEdited = `የተሻሻለ ዝግጅት ${suffix}`;
  await login(page, "am");

  await page.goto("/am/dashboard/posts");
  await page.getByRole("button", { name: dashboard.newPost }).click();
  let dialog = page.getByRole("dialog", { name: dashboard.createPost });
  await dialog.getByLabel(`${dashboard.title} (${dashboard.english})`).fill(`Smoke post ${suffix}`);
  await dialog
    .getByLabel(`${dashboard.postContent} (${dashboard.english})`)
    .fill(`English content ${suffix}`);
  await dialog.getByRole("tab", { name: dashboard.amharic }).click();
  await dialog.getByLabel(`${dashboard.title} (${dashboard.amharic})`).fill(postTitle);
  await dialog
    .getByLabel(`${dashboard.postContent} (${dashboard.amharic})`)
    .fill(`ይህ የፈተና ጽሑፍ ነው ${suffix}`);
  await dialog.getByRole("button", { name: dashboard.createPost }).click();
  let postRow = page.getByRole("row").filter({ hasText: postTitle });
  await expect(postRow).toBeVisible();
  await postRow.getByRole("button", { name: dashboard.publish }).click();
  await expect(postRow).toContainText(dashboard.statusPublishedLabel);
  await waitForPublicContent(page, "/am/blog", page.getByRole("heading", { name: postTitle }));

  await page.goto("/am/dashboard/posts");
  postRow = page.getByRole("row").filter({ hasText: postTitle });
  await postRow.getByRole("button", { name: dashboard.edit }).click();
  dialog = page.getByRole("dialog", { name: dashboard.editPost });
  await dialog.getByRole("tab", { name: dashboard.amharic }).click();
  await dialog.getByLabel(`${dashboard.title} (${dashboard.amharic})`).fill(postTitleEdited);
  await dialog.getByRole("button", { name: dashboard.saveChanges }).click();
  postRow = page.getByRole("row").filter({ hasText: postTitleEdited });
  await expect(postRow).toBeVisible();
  page.once("dialog", (confirm) => confirm.accept());
  await postRow.getByRole("button", { name: dashboard.delete }).click();
  await expect(page.getByRole("row").filter({ hasText: postTitleEdited })).toHaveCount(0);

  await page.goto("/am/dashboard/events");
  await page.getByRole("button", { name: dashboard.newEvent }).click();
  dialog = page.getByRole("dialog", { name: dashboard.createEvent });
  await dialog
    .getByLabel(`${dashboard.title} (${dashboard.english})`)
    .fill(`Smoke event ${suffix}`);
  await dialog
    .getByLabel(`${dashboard.description} (${dashboard.english})`)
    .fill(`English details ${suffix}`);
  await dialog.getByLabel(`${dashboard.location} (${dashboard.english})`).fill("Test venue");
  await dialog.getByLabel(dashboard.dateAndTime, { exact: true }).fill(futureDateTime());
  await dialog.getByRole("tab", { name: dashboard.amharic }).click();
  await dialog.getByLabel(`${dashboard.title} (${dashboard.amharic})`).fill(eventTitle);
  await dialog
    .getByLabel(`${dashboard.description} (${dashboard.amharic})`)
    .fill(`የፈተና ዝግጅት መግለጫ ${suffix}`);
  await dialog.getByLabel(`${dashboard.location} (${dashboard.amharic})`).fill("የፈተና ቦታ");
  await dialog.getByRole("button", { name: dashboard.createEvent }).click();
  let eventRow = page.getByRole("row").filter({ hasText: eventTitle });
  await expect(eventRow).toBeVisible();
  await waitForPublicContent(page, "/am/events", page.getByRole("heading", { name: eventTitle }));

  await page.goto("/am/dashboard/events");
  eventRow = page.getByRole("row").filter({ hasText: eventTitle });
  await eventRow.getByRole("button", { name: dashboard.edit }).click();
  dialog = page.getByRole("dialog", { name: dashboard.editEvent });
  await dialog.getByRole("tab", { name: dashboard.amharic }).click();
  await dialog.getByLabel(`${dashboard.title} (${dashboard.amharic})`).fill(eventTitleEdited);
  await dialog.getByRole("button", { name: dashboard.saveChanges }).click();
  eventRow = page.getByRole("row").filter({ hasText: eventTitleEdited });
  await expect(eventRow).toBeVisible();
  page.once("dialog", (confirm) => confirm.accept());
  await eventRow.getByRole("button", { name: dashboard.delete }).click();
  await expect(page.getByRole("row").filter({ hasText: eventTitleEdited })).toHaveCount(0);
});

test("Amharic contact inbox displays the API's localized validation error", async ({
  page,
}, testInfo) => {
  const suffix = createTestSuffix(testInfo);
  await login(page, "am");
  await page.goto("/am/contact");
  await page.getByLabel(am.contact.name).fill(`Inbox ${suffix}`);
  await page.getByLabel(am.contact.emailLabel).fill(`inbox-${suffix}@example.invalid`);
  await page.getByLabel(am.contact.message).fill("የፈተና መልእክት");
  await page.getByRole("button", { name: am.contact.send }).click();
  await expect(page.getByText(am.contact.success)).toBeVisible();

  await page.goto("/am/dashboard/messages");
  const row = page.getByRole("row").filter({ hasText: `Inbox ${suffix}` });
  await expect(row).toBeVisible();
  let observedLanguage = "";
  await page.route("**/api/staff/contact-messages/*", async (route) => {
    observedLanguage = route.request().headers()["accept-language"] ?? "";
    await route.continue({ postData: JSON.stringify({ status: "invalid" }) });
  });
  await row.getByRole("button", { name: dashboard.markRead }).click();
  await expect(page.locator(".status-error")).toContainText(/[\u1200-\u137F]/);
  expect(observedLanguage).toContain("am");
});

test("volunteer sees localized profile, application, and event signup on Amharic routes", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = createTestSuffix(testInfo);
  const email = `volunteer-${suffix}@example.invalid`;
  const password = "Bright-River-Safe-9402!";
  await login(page, "en");
  const seeded = await page.evaluate(
    async ({ email, password, suffix }) => {
      const user = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `E2E volunteer ${suffix}`,
          email,
          password,
          role: "volunteer",
        }),
      });
      const event = await fetch("/api/staff/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translations: {
            en: {
              title: `E2E event ${suffix}`,
              description: "Signup check",
              location: "Community hall",
            },
            am: {
              title: `የምዝገባ ዝግጅት ${suffix}`,
              description: "የምዝገባ ፈተና",
              location: "የማኅበረሰብ አዳራሽ",
            },
          },
          event_date: new Date(Date.now() + 86400000).toISOString(),
        }),
      });
      return { userStatus: user.status, eventStatus: event.status };
    },
    { email, password, suffix },
  );
  expect([200, 201]).toContain(seeded.userStatus);
  expect([200, 201]).toContain(seeded.eventStatus);

  await page.getByRole("button", { name: en.dashboard.logout }).click();
  await login(page, "am", email, password);
  await page.goto("/am/dashboard/profile");
  await expect(page.getByRole("heading", { name: am.dashboard.profile })).toBeVisible();
  await page.goto("/am/volunteer");
  await expect(page.getByText(new RegExp(am.volunteer.role.replace("{role}", ".*")))).toBeVisible();
  const event = page.locator("article.card").filter({ hasText: `የምዝገባ ዝግጅት ${suffix}` });
  await waitForPublicContent(page, "/am/events", event);
  await event.getByRole("button", { name: am.events.signup }).click();
  await expect(event.getByRole("button", { name: am.events.cancel })).toBeVisible();
});

function futureDateTime() {
  const date = new Date(Date.now() + 86400000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function createTestSuffix(testInfo: { workerIndex: number; retry: number }) {
  return `${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}-${randomUUID().slice(0, 8)}`;
}
