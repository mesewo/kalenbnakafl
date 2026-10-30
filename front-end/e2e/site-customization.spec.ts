import { deflateSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1 ? 0xedb88320 : 0) ^ (crc >>> 1);
  return crc >>> 0;
});

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  const checksumInput = Buffer.concat([name, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(checksumInput), 8 + data.length);
  return chunk;
}

function createPng(width: number, height: number, color: readonly [number, number, number]) {
  const rowLength = width * 4 + 1;
  const pixels = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    pixels[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = rowStart + 1 + x * 4;
      pixels[pixel] = color[0];
      pixels[pixel + 1] = color[1];
      pixels[pixel + 2] = color[2];
      pixels[pixel + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function uploadImage(
  page: Page,
  title: string,
  amharicTitle: string,
  altText: string,
  amharicAltText: string,
  width: number,
  height: number,
  color: readonly [number, number, number],
) {
  await page.locator("#media-upload-file").setInputFiles({
    name: `${title.replaceAll(" ", "-")}.png`,
    mimeType: "image/png",
    buffer: createPng(width, height, color),
  });
  await page.getByLabel("Image name (English)").fill(title);
  await page.getByLabel("Image name (አማርኛ)").fill(amharicTitle);
  await page.getByLabel("Alternative text (English)").fill(altText);
  await page.getByLabel("Alternative text (አማርኛ)").fill(amharicAltText);
  const uploaded = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/staff/media"),
  );
  await page.getByRole("button", { name: "Upload media" }).click();
  expect((await uploaded).status()).toBe(201);
  await expect(page.locator(".media-library-card").filter({ hasText: title })).toBeVisible({
    timeout: 20_000,
  });
}

test("admin manages slider, About photos, and branding in both locales", async ({ page }) => {
  test.setTimeout(480_000);
  expect(adminEmail, "ADMIN_EMAIL must be set for the smoke test").toBeTruthy();
  expect(adminPassword, "ADMIN_PASSWORD must be set for the smoke test").toBeTruthy();
  const suffix = `${Date.now()}-${randomUUID().slice(0, 7)}`;
  const logoTitle = `Brand logo ${suffix}`;
  const faviconTitle = `Brand icon ${suffix}`;
  const shareTitle = `Share image ${suffix}`;
  const titles = {
    logo: `የአርማ ሙከራ ${suffix}`,
    favicon: `የአዶ ሙከራ ${suffix}`,
    share: `የማጋሪያ ሙከራ ${suffix}`,
  };
  const englishAlt = `Community participants ${suffix}`;
  const amharicAlt = `የማኅበረሰብ ተሳታፊዎች ${suffix}`;
  const englishSlideCaption = `Community work together ${suffix}`;
  const amharicSlideCaption = `የጋራ ማኅበረሰብ ሥራ ${suffix}`;
  const secondEnglishSlideCaption = `Community gathering ${suffix}`;
  const secondAmharicSlideCaption = `የማኅበረሰብ ስብሰባ ${suffix}`;
  const englishAboutCaption = `Neighbors building a garden ${suffix}`;
  const amharicAboutCaption = `ጎረቤቶች አትክልት ሲያዘጋጁ ${suffix}`;
  const englishSiteName = `Kalen Community ${suffix}`;
  const amharicSiteName = `ካለን ማኅበረሰብ ${suffix}`;
  const englishTagline = `Together for a stronger community ${suffix}`;
  const amharicTagline = `ለጠንካራ ማኅበረሰብ በጋራ ${suffix}`;

  await page.goto("/en/auth/login");
  await page.getByLabel("Email address").fill(adminEmail!);
  await page.getByLabel("Password").fill(adminPassword!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);

  const originalSettings = await page.evaluate(async () => {
    const response = await fetch("/api/admin/site-settings");
    if (!response.ok) throw new Error("Could not save the original site settings for cleanup");
    return (await response.json()) as {
      logo_media_id: number | null;
      favicon_media_id: number | null;
      social_image_media_id: number | null;
      translations: {
        en: { site_name: string; tagline: string };
        am: { site_name: string; tagline: string };
      };
    };
  });
  try {
    await page.goto("/en/dashboard/media");
    await uploadImage(page, logoTitle, titles.logo, englishAlt, amharicAlt, 640, 160, [49, 92, 74]);
    await uploadImage(
      page,
      faviconTitle,
      titles.favicon,
      englishAlt,
      amharicAlt,
      512,
      512,
      [245, 200, 66],
    );
    await uploadImage(
      page,
      shareTitle,
      titles.share,
      englishAlt,
      amharicAlt,
      1200,
      630,
      [21, 34, 56],
    );

    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto("/am/dashboard/home-slider");
    await page.getByRole("button", { name: "ስላይድ ያክሉ" }).first().click();
    await page.getByRole("button", { name: "ምስል ይምረጡ" }).click();
    let picker = page.getByRole("dialog", { name: "ፎቶ ይምረጡ" });
    await picker.getByRole("button", { name: new RegExp(titles.share) }).click();
    await picker.getByRole("button", { name: "ይህን ፎቶ ይጠቀሙ" }).click();
    await page.getByLabel("የእንግሊዝኛ መግለጫ").fill(englishSlideCaption);
    await page.getByLabel("የአማርኛ መግለጫ").fill(amharicSlideCaption);
    await page.getByRole("button", { name: "ስላይድ ያክሉ" }).last().click();
    await expect(page.getByRole("status").filter({ hasText: "ለውጦቹ ተቀምጠዋል" })).toBeVisible();
    await page.getByRole("button", { name: "ስላይድ ያክሉ" }).first().click();
    await page
      .locator(".site-content-card")
      .last()
      .getByRole("button", { name: "ምስል ይምረጡ" })
      .click();
    picker = page.getByRole("dialog", { name: "ፎቶ ይምረጡ" });
    await picker.getByRole("button", { name: new RegExp(titles.share) }).click();
    await picker.getByRole("button", { name: "ይህን ፎቶ ይጠቀሙ" }).click();
    await page.getByLabel("የእንግሊዝኛ መግለጫ").fill(secondEnglishSlideCaption);
    await page.getByLabel("የአማርኛ መግለጫ").fill(secondAmharicSlideCaption);
    await page.getByRole("button", { name: "ስላይድ ያክሉ" }).last().click();
    await expect(page.getByRole("status").filter({ hasText: "ለውጦቹ ተቀምጠዋል" })).toBeVisible();
    await page
      .locator(".site-content-card")
      .first()
      .getByRole("button", { name: "ስላይዱን ወደ ታች ያንቀሳቅሱ" })
      .click();

    await page.goto("/am/dashboard/about-images");
    await page.getByRole("button", { name: "የስለ እኛ ምስል ያክሉ" }).first().click();
    await page.getByRole("button", { name: "ምስል ይምረጡ" }).click();
    picker = page.getByRole("dialog", { name: "ፎቶ ይምረጡ" });
    await picker.getByRole("button", { name: new RegExp(titles.share) }).click();
    await picker.getByRole("button", { name: "ይህን ፎቶ ይጠቀሙ" }).click();
    await page.getByLabel("የእንግሊዝኛ መግለጫ").fill(englishAboutCaption);
    await page.getByLabel("የአማርኛ መግለጫ").fill(amharicAboutCaption);
    await page.getByRole("button", { name: "የስለ እኛ ምስል ያክሉ" }).last().click();
    await expect(page.getByRole("status").filter({ hasText: "ለውጦቹ ተቀምጠዋል" })).toBeVisible();

    await page.goto("/am/dashboard/branding");
    for (const [slotTitle, imageTitle] of [
      ["የድረ ገጽ አርማ", titles.logo],
      ["የትር አዶ", titles.favicon],
      ["ለማኅበራዊ ማጋራት ምስል", titles.share],
    ] as const) {
      const slot = page.locator(".branding-slot").filter({ hasText: slotTitle });
      await slot.getByRole("button", { name: "ምስል ይምረጡ" }).click();
      picker = page.getByRole("dialog", { name: "ፎቶ ይምረጡ" });
      await picker.getByRole("button", { name: new RegExp(imageTitle) }).click();
      await picker.getByRole("button", { name: "ይህን ፎቶ ይጠቀሙ" }).click();
    }
    await page.getByLabel("የድረ ገጽ ስም").nth(0).fill(englishSiteName);
    await page.getByLabel("የድረ ገጽ ስም").nth(1).fill(amharicSiteName);
    await page.getByLabel("መለያ ሐረግ").nth(0).fill(englishTagline);
    await page.getByLabel("መለያ ሐረግ").nth(1).fill(amharicTagline);
    await page.getByRole("button", { name: "ለውጦቹን ያስቀምጡ" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ለውጦቹ ተቀምጠዋል" })).toBeVisible();

    await expect
      .poll(
        async () => {
          await page.goto("/en");
          return page.getByText(secondEnglishSlideCaption, { exact: true }).count();
        },
        { timeout: 90_000, intervals: [3000, 5000, 10000] },
      )
      .toBeGreaterThan(0);
    await expect(page.getByAltText(englishAlt)).toBeVisible();
    const carousel = page.getByRole("region", { name: "Featured images" });
    await expect(carousel.getByRole("button", { name: "Previous image" })).toBeVisible();
    const pauseSlides = carousel.getByRole("button", { name: "Pause slideshow" });
    await expect(pauseSlides).toBeVisible();
    await pauseSlides.click();
    await carousel.locator(".home-slider").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(englishSlideCaption, { exact: true })).toBeVisible();
    await expect(page.getByText(englishSiteName).first()).toBeVisible();
    const metaImage = page.locator('meta[property="og:image"]');
    await expect(metaImage).toHaveAttribute("content", /^https?:\/\//);
    const socialMediaID = await page.evaluate(async () => {
      const response = await fetch("/api/admin/site-settings");
      const settings = (await response.json()) as { social_image_media_id: number };
      return settings.social_image_media_id;
    });
    await expect(metaImage).toHaveAttribute(
      "content",
      new RegExp(`/api/media/${socialMediaID}/file`),
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      "content",
      new RegExp(`/api/media/${socialMediaID}/file`),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(
        async () => {
          await page.goto("/am");
          return page.getByText(secondAmharicSlideCaption, { exact: true }).count();
        },
        { timeout: 90_000, intervals: [3000, 5000, 10000] },
      )
      .toBeGreaterThan(0);
    await expect(page.getByAltText(amharicAlt)).toBeVisible();
    await expect(page.getByRole("button", { name: "ራስ-ሰር እንቅስቃሴ ጠፍቷል" })).toBeVisible();
    await page.getByRole("button", { name: "ቀጣዩ ምስል" }).click();
    await expect(page.getByText(englishSlideCaption, { exact: true })).toBeVisible();
    await expect(page.getByText(amharicSiteName).first()).toBeVisible();
    const favicon = page.locator('link[rel="icon"]');
    const faviconID = await page.evaluate(async () => {
      const response = await fetch("/api/admin/site-settings");
      const settings = (await response.json()) as { favicon_media_id: number };
      return settings.favicon_media_id;
    });
    await expect(favicon).toHaveAttribute("href", new RegExp(`/api/media/${faviconID}/file`));
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    for (const [locale, caption] of [
      ["en", englishAboutCaption],
      ["am", amharicAboutCaption],
    ] as const) {
      await expect
        .poll(
          async () => {
            await page.goto(`/${locale}/about`);
            return page.getByText(caption, { exact: true }).count();
          },
          { timeout: 90_000, intervals: [3000, 5000, 10000] },
        )
        .toBeGreaterThan(0);
      await expect(page.getByAltText(locale === "en" ? englishAlt : amharicAlt)).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    }
  } finally {
    await page.evaluate(
      async ({ slideCaptions, aboutCaptions, original }) => {
        const slideResponse = await fetch("/api/admin/home-slides");
        if (slideResponse.ok) {
          const slides = (await slideResponse.json()) as {
            items: Array<{
              id: number;
              translations?: { en?: { caption: string }; am?: { caption: string } };
            }>;
          };
          for (const slide of slides.items) {
            if (
              slideCaptions.includes(slide.translations?.en?.caption ?? "") ||
              slideCaptions.includes(slide.translations?.am?.caption ?? "")
            ) {
              const deleted = await fetch(`/api/admin/home-slides/${slide.id}`, {
                method: "DELETE",
              });
              if (!deleted.ok) throw new Error("Could not clean up the test home slide");
            }
          }
        }
        const aboutResponse = await fetch("/api/admin/about-images");
        if (aboutResponse.ok) {
          const images = (await aboutResponse.json()) as {
            items: Array<{
              id: number;
              translations?: { en?: { caption: string }; am?: { caption: string } };
            }>;
          };
          for (const image of images.items) {
            if (
              aboutCaptions.includes(image.translations?.en?.caption ?? "") ||
              aboutCaptions.includes(image.translations?.am?.caption ?? "")
            ) {
              const deleted = await fetch(`/api/admin/about-images/${image.id}`, {
                method: "DELETE",
              });
              if (!deleted.ok) throw new Error("Could not clean up the test About image");
            }
          }
        }
        const restored = await fetch("/api/admin/site-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            logo_media_id: original.logo_media_id,
            favicon_media_id: original.favicon_media_id,
            social_image_media_id: original.social_image_media_id,
            translations: original.translations,
          }),
        });
        if (!restored.ok) throw new Error("Could not restore the original site settings");
      },
      {
        slideCaptions: [
          englishSlideCaption,
          amharicSlideCaption,
          secondEnglishSlideCaption,
          secondAmharicSlideCaption,
        ],
        aboutCaptions: [englishAboutCaption, amharicAboutCaption],
        original: originalSettings,
      },
    );
  }
});
