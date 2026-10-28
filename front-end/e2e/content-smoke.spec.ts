import { expect, test } from "@playwright/test";
import { waitForPublicContent } from "./helpers/public-content";

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

test("admin content and public bilingual flows", async ({ page }) => {
  test.setTimeout(240_000);
  expect(adminEmail, "ADMIN_EMAIL must be set for the smoke test").toBeTruthy();
  expect(adminPassword, "ADMIN_PASSWORD must be set for the smoke test").toBeTruthy();
  const suffix = `${Date.now()}`;
  const postTitle = `Smoke post ${suffix}`;
  const amPostTitle = `የሙከራ ጽሑፍ ${suffix}`;
  const editedPostTitle = `Edited smoke post ${suffix}`;
  const eventTitle = `Smoke event ${suffix}`;
  const amEventTitle = `የሙከራ ዝግጅት ${suffix}`;
  const editedEventTitle = `Edited smoke event ${suffix}`;

  await page.goto("/en/auth/login");
  await page.getByLabel("Email address").fill(adminEmail!);
  await page.getByLabel("Password").fill(adminPassword!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);

  await page.goto("/en/dashboard/posts");
  await expect(page).toHaveURL(/\/en\/dashboard\/posts$/);
  await page.getByRole("button", { name: "New post" }).click();
  let dialog = page.getByRole("dialog", { name: "Create a post" });
  await dialog.getByLabel("Title (English)").fill(postTitle);
  await dialog.getByLabel("Content (English)").fill(`English body ${suffix}`);
  await dialog.getByRole("tab", { name: "አማርኛ" }).click();
  await dialog.getByLabel("Title (አማርኛ)").fill(amPostTitle);
  await dialog.getByLabel("Content (አማርኛ)").fill(`የአማርኛ ይዘት ${suffix}`);
  await dialog.getByRole("button", { name: "Create a post" }).click();

  let postRow = page.getByRole("row").filter({ hasText: postTitle });
  await expect(postRow).toBeVisible();
  await postRow.getByRole("button", { name: "Publish" }).click();
  await expect(postRow).toContainText("Published");
  await waitForPublicContent(page, "/en/blog", page.getByRole("heading", { name: postTitle }));
  const enPostCard = page.locator("article.card").filter({ hasText: postTitle });
  await enPostCard.getByRole("link", { name: "Read the full note →" }).click();
  await expect(page.getByText(`English body ${suffix}`)).toBeVisible();
  await waitForPublicContent(page, "/am/blog", page.getByRole("heading", { name: amPostTitle }));
  const amPostCard = page.locator("article.card").filter({ hasText: amPostTitle });
  await amPostCard.getByRole("link", { name: "ሙሉ ታሪኩን ያንብቡ →" }).click();
  await expect(page).toHaveURL(/\/am\/blog\//);
  await expect(page.getByText(`የአማርኛ ይዘት ${suffix}`)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");

  await page.goto("/en/contact");
  await page.getByRole("button", { name: "አማርኛ" }).click();
  await expect(page).toHaveURL("/am/contact");
  await expect(page.locator(".site-header .brand-copy strong")).toHaveText("ካለን ብናካፍል");
  await page.getByLabel("ስምዎ").fill(`Smoke ${suffix}`);
  await page.getByLabel("ኢሜይል አድራሻ").fill(`smoke-${suffix}@example.invalid`);
  await page.getByLabel("እንዴት እንርዳዎ?").fill("የሙከራ መልእክት");
  await page.getByRole("button", { name: "መልእክት ይላኩ" }).click();
  await expect(page.getByText("መልእክትዎ ተልኳል። በቅርቡ እንመልስልዎታለን።")).toBeVisible();
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

  await page.goto("/en/dashboard/posts");
  postRow = page.getByRole("row").filter({ hasText: postTitle });
  await postRow.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit post" });
  await dialog.getByLabel("Title (English)").fill(editedPostTitle);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  postRow = page.getByRole("row").filter({ hasText: editedPostTitle });
  await expect(postRow).toBeVisible();
  page.once("dialog", (alert) => alert.accept());
  await postRow.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row").filter({ hasText: editedPostTitle })).toHaveCount(0);

  await page.goto("/en/dashboard/events");
  await page.getByRole("button", { name: "New event" }).click();
  dialog = page.getByRole("dialog", { name: "Create an event" });
  await dialog.getByLabel("Title (English)").fill(eventTitle);
  await dialog.getByLabel("Description (English)").fill(`English event details ${suffix}`);
  await dialog.getByLabel("Location (English)").fill("Smoke test venue");
  const eventStart = futureDateTime();
  await dialog.getByLabel("Date and time", { exact: true }).fill(eventStart);
  await dialog.getByRole("tab", { name: "አማርኛ" }).click();
  await dialog.getByLabel("Title (አማርኛ)").fill(amEventTitle);
  await dialog.getByLabel("Description (አማርኛ)").fill(`የአማርኛ ዝግጅት ${suffix}`);
  await dialog.getByLabel("Location (አማርኛ)").fill("የሙከራ ቦታ");
  await dialog.getByRole("button", { name: "Create an event" }).click();

  let eventRow = page.getByRole("row").filter({ hasText: eventTitle });
  await expect(eventRow).toBeVisible();
  await waitForPublicContent(page, "/am/events", page.getByRole("heading", { name: amEventTitle }));
  const eventCard = page.locator("article.card").filter({ hasText: amEventTitle });
  const ethiopianDate = await page.evaluate(
    (date) =>
      new Intl.DateTimeFormat("am-ET-u-ca-ethiopic", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(date)),
    new Date(eventStart).toISOString(),
  );
  await expect(eventCard.locator(".eyebrow")).toHaveText(ethiopianDate);
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
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

  await page.goto("/en/dashboard/events");
  eventRow = page.getByRole("row").filter({ hasText: eventTitle });
  await eventRow.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit event" });
  await dialog.getByLabel("Title (English)").fill(editedEventTitle);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  eventRow = page.getByRole("row").filter({ hasText: editedEventTitle });
  await expect(eventRow).toBeVisible();
  page.once("dialog", (alert) => alert.accept());
  await eventRow.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row").filter({ hasText: editedEventTitle })).toHaveCount(0);
});

function futureDateTime() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
