import { expect, test } from "@playwright/test";

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

test("admin content and public bilingual flows", async ({ page }) => {
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
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/dashboard/posts");
  await expect(page).toHaveURL(/\/dashboard\/posts$/);
  await page.getByRole("button", { name: "New post" }).click();
  let dialog = page.getByRole("dialog", { name: "Create a post" });
  await dialog.getByLabel("Title (English)").fill(postTitle);
  await dialog.getByLabel("Content (English)").fill(`English body ${suffix}`);
  await dialog.getByRole("tab", { name: "አማርኛ" }).click();
  await dialog.getByLabel("Title (አማርኛ)").fill(amPostTitle);
  await dialog.getByLabel("Content (አማርኛ)").fill(`የአማርኛ ይዘት ${suffix}`);
  await dialog.getByRole("button", { name: "Create post" }).click();

  let postRow = page.getByRole("row").filter({ hasText: postTitle });
  await expect(postRow).toBeVisible();
  await postRow.getByRole("button", { name: "Publish" }).click();
  await page.goto("/en/blog");
  await expect(page.getByRole("heading", { name: postTitle })).toBeVisible();
  await page.getByRole("link", { name: "Read the full note →" }).first().click();
  await expect(page.getByText(`English body ${suffix}`)).toBeVisible();
  await page.goto("/am/blog");
  await expect(page.getByRole("heading", { name: amPostTitle })).toBeVisible();
  await page.getByRole("link", { name: "ሙሉ ታሪኩን ያንብቡ →" }).first().click();
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

  await page.goto("/dashboard/posts");
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

  await page.goto("/dashboard/events");
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
  await dialog.getByRole("button", { name: "Create event" }).click();

  let eventRow = page.getByRole("row").filter({ hasText: eventTitle });
  await expect(eventRow).toBeVisible();
  await page.goto("/am/events");
  await expect(page.getByRole("heading", { name: amEventTitle })).toBeVisible();
  const eventCard = page.locator("article.card").filter({ hasText: amEventTitle });
  const ethiopianDate = await page.evaluate(
    (date) =>
      new Intl.DateTimeFormat("am-ET-u-ca-ethiopic", {
        dateStyle: "medium",
        timeStyle: "short",
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

  await page.goto("/dashboard/events");
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
