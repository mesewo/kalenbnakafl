import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { waitForPublicContent } from "./helpers/public-content";

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

test("admin uploads, uses, and protects a bilingual cover image", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  expect(adminEmail, "ADMIN_EMAIL must be set for the smoke test").toBeTruthy();
  expect(adminPassword, "ADMIN_PASSWORD must be set for the smoke test").toBeTruthy();
  const suffix = `${Date.now()}-${testInfo.workerIndex}-${randomUUID().slice(0, 8)}`;
  const imageTitle = `Smoke image ${suffix}`;
  const englishAlt = `Community garden volunteers ${suffix}`;
  const amharicAlt = `የማኅበረሰብ ፈቃደኞች ${suffix}`;
  const postTitle = `Image post ${suffix}`;
  const amharicPostTitle = `የምስል ጽሑፍ ${suffix}`;
  const eventTitle = `Image event ${suffix}`;
  const amharicEventTitle = `የምስል ዝግጅት ${suffix}`;

  await page.goto("/en/auth/login");
  await page.getByLabel("Email address").fill(adminEmail!);
  await page.getByLabel("Password").fill(adminPassword!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/en/dashboard/media");
  await page.locator("#media-upload-file").setInputFiles({
    name: "community-photo.png",
    mimeType: "image/png",
    buffer: image,
  });
  await page.getByLabel("Image name (English)").fill(imageTitle);
  await page.getByLabel("Alternative text (English)").fill(englishAlt);
  await page.getByLabel("Alternative text (አማርኛ)").fill(amharicAlt);
  const uploadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/staff/media"),
  );
  await page.getByRole("button", { name: "Upload media" }).click();
  expect((await uploadResponse).status()).toBe(201);
  const mediaCard = page.locator(".media-library-card").filter({ hasText: imageTitle });
  await expect(mediaCard).toBeVisible({ timeout: 15_000 });

  await page.goto("/am/dashboard/posts");
  await page.getByRole("button", { name: "አዲስ ጽሑፍ" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "የሽፋን ፎቶ ይምረጡ" }).click();
  let picker = page.getByRole("dialog", { name: "ፎቶ ይምረጡ" });
  await picker.getByRole("button", { name: new RegExp(imageTitle) }).click();
  await expect(picker.getByRole("button", { name: "ይህን ፎቶ ይጠቀሙ" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await picker.getByRole("button", { name: "ይህን ፎቶ ይጠቀሙ" }).click();
  await dialog.getByRole("button", { name: "መስኮቱን ዝጋ" }).click();

  await page.goto("/en/dashboard/posts");
  await page.getByRole("button", { name: "New post" }).click();
  dialog = page.getByRole("dialog", { name: "Create a post" });
  await dialog.getByLabel("Title (English)").fill(postTitle);
  await dialog.getByLabel("Content (English)").fill(`English body ${suffix}`);
  await dialog.getByRole("button", { name: "Insert image" }).click();
  picker = page.getByRole("dialog", { name: "Choose a photo" });
  await expect(picker).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await picker.getByRole("button", { name: new RegExp(imageTitle) }).click();
  await picker.getByRole("button", { name: "Use this photo" }).click();
  await expect(dialog.getByLabel("Content (English)")).toHaveValue(/{{media:/);
  await dialog.getByRole("button", { name: "Choose a cover photo" }).click();
  picker = page.getByRole("dialog", { name: "Choose a photo" });
  await picker.getByRole("button", { name: new RegExp(imageTitle) }).click();
  await picker.getByRole("button", { name: "Use this photo" }).click();
  await dialog.getByRole("tab", { name: "አማርኛ" }).click();
  await dialog.getByLabel("Title (አማርኛ)").fill(amharicPostTitle);
  await dialog.getByLabel("Content (አማርኛ)").fill(`የአማርኛ ይዘት ${suffix}`);
  await dialog.getByRole("button", { name: "Create a post" }).click();

  const postRow = page.getByRole("row").filter({ hasText: postTitle });
  await expect(postRow).toBeVisible();
  await postRow.getByRole("button", { name: "Publish" }).click();
  await expect(postRow).toContainText("Published");
  await waitForPublicContent(page, "/en/blog", page.getByRole("heading", { name: postTitle }));
  const postCard = page.locator("article.card").filter({ hasText: postTitle });
  await expect(postCard.getByRole("img", { name: englishAlt })).toBeVisible();
  await postCard.getByRole("link", { name: "Read the full note →" }).click();
  await expect(page.getByRole("img", { name: englishAlt })).toHaveCount(2);
  await expect(page.locator("picture source").first()).toHaveAttribute("srcset", /w=480/);
  await waitForPublicContent(
    page,
    "/am/blog",
    page.getByRole("heading", { name: amharicPostTitle }),
  );
  const amharicPostCard = page.locator("article.card").filter({ hasText: amharicPostTitle });
  await expect(amharicPostCard.getByRole("img", { name: amharicAlt })).toBeVisible();
  await amharicPostCard.getByRole("link", { name: "ሙሉ ታሪኩን ያንብቡ →" }).click();
  await expect(page.getByRole("img", { name: amharicAlt })).toBeVisible();

  await page.goto("/en/dashboard/events");
  await page.getByRole("button", { name: "New event" }).click();
  dialog = page.getByRole("dialog", { name: "Create an event" });
  await dialog.getByLabel("Title (English)").fill(eventTitle);
  await dialog.getByLabel("Description (English)").fill(`English event ${suffix}`);
  await dialog.getByLabel("Location (English)").fill("Community hall");
  await dialog.getByLabel("Date and time", { exact: true }).fill(futureDateTime());
  await dialog.getByRole("button", { name: "Choose a cover photo" }).click();
  picker = page.getByRole("dialog", { name: "Choose a photo" });
  await picker.getByRole("button", { name: new RegExp(imageTitle) }).click();
  await picker.getByRole("button", { name: "Use this photo" }).click();
  await dialog.getByRole("tab", { name: "አማርኛ" }).click();
  await dialog.getByLabel("Title (አማርኛ)").fill(amharicEventTitle);
  await dialog.getByLabel("Description (አማርኛ)").fill(`የአማርኛ ዝግጅት ${suffix}`);
  await dialog.getByLabel("Location (አማርኛ)").fill("የማኅበረሰብ አዳራሽ");
  await dialog.getByRole("button", { name: "Create an event" }).click();

  const eventRow = page.getByRole("row").filter({ hasText: eventTitle });
  await expect(eventRow).toBeVisible();
  await waitForPublicContent(page, "/en/events", page.getByRole("heading", { name: eventTitle }));
  const eventCard = page.locator("article.card").filter({ hasText: eventTitle });
  await expect(eventCard.getByRole("img", { name: englishAlt })).toBeVisible();
  await eventCard.getByRole("link", { name: "View event details" }).click();
  await expect(page.getByRole("img", { name: englishAlt })).toBeVisible();
  await waitForPublicContent(
    page,
    "/am/events",
    page.getByRole("heading", { name: amharicEventTitle }),
  );
  const amharicEventCard = page.locator("article.card").filter({ hasText: amharicEventTitle });
  await expect(amharicEventCard.getByRole("img", { name: amharicAlt })).toBeVisible();
  await amharicEventCard.getByRole("link", { name: "የዝግጅቱን ዝርዝር ይመልከቱ" }).click();
  await expect(page.getByRole("img", { name: amharicAlt })).toBeVisible();
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
  const postAdminRow = page.getByRole("row").filter({ hasText: postTitle });
  await postAdminRow.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit post" });
  await dialog.getByRole("button", { name: "Remove cover" }).click();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(postAdminRow.locator(".cover-placeholder")).toBeVisible();

  await page.goto("/en/dashboard/media");
  const usedMediaCard = page.locator(".media-library-card").filter({ hasText: imageTitle });
  page.once("dialog", (confirm) => confirm.accept());
  await usedMediaCard.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alert")).toContainText("in use");
  await expect(usedMediaCard).toContainText(postTitle);
  await expect(usedMediaCard).toContainText(eventTitle);
});

function futureDateTime() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
