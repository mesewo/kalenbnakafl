import { deflateSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { waitForPublicContent } from "./helpers/public-content";

const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

type SiteSettingsSnapshot = {
  logo_media_id: number | null;
  favicon_media_id: number | null;
  social_image_media_id: number | null;
  translations: {
    en: { site_name: string; tagline: string };
    am: { site_name: string; tagline: string };
  };
};
type HeroTitleSnapshot = { en: string; am: string };
type CleanupState = {
  appOrigin: string;
  originalSettings: SiteSettingsSnapshot;
  originalHeroTranslations: HeroTitleSnapshot;
  slideCaptions: string[];
  aboutCaptions: string[];
};

let cleanupState: CleanupState | null = null;

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

test.afterEach(async ({ page }, testInfo) => {
  const state = cleanupState;
  cleanupState = null;
  if (!state) return;
  testInfo.setTimeout(90_000);

  const apiRequest = page.request;
  const requestHeaders = { origin: state.appOrigin };
  const cleanupErrors: string[] = [];
  const cleanup = async (label: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      cleanupErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await cleanup("home slides", async () => {
    const response = await apiRequest.get(`${state.appOrigin}/api/admin/home-slides`);
    if (!response.ok()) throw new Error("Could not load home slides");
    const slides = (await response.json()) as {
      items: Array<{
        id: number;
        translations?: { en?: { caption: string }; am?: { caption: string } };
      }>;
    };
    for (const slide of slides.items) {
      if (
        state.slideCaptions.includes(slide.translations?.en?.caption ?? "") ||
        state.slideCaptions.includes(slide.translations?.am?.caption ?? "")
      ) {
        const deleted = await apiRequest.delete(
          `${state.appOrigin}/api/admin/home-slides/${slide.id}`,
          { headers: requestHeaders },
        );
        if (!deleted.ok()) throw new Error("Could not delete the test home slide");
      }
    }
  });
  await cleanup("About images", async () => {
    const response = await apiRequest.get(`${state.appOrigin}/api/admin/about-images`);
    if (!response.ok()) throw new Error("Could not load About images");
    const images = (await response.json()) as {
      items: Array<{
        id: number;
        translations?: { en?: { caption: string }; am?: { caption: string } };
      }>;
    };
    for (const image of images.items) {
      if (
        state.aboutCaptions.includes(image.translations?.en?.caption ?? "") ||
        state.aboutCaptions.includes(image.translations?.am?.caption ?? "")
      ) {
        const deleted = await apiRequest.delete(
          `${state.appOrigin}/api/admin/about-images/${image.id}`,
          { headers: requestHeaders },
        );
        if (!deleted.ok()) throw new Error("Could not delete the test About image");
      }
    }
  });
  await cleanup("site settings", async () => {
    const restored = await apiRequest.put(`${state.appOrigin}/api/admin/site-settings`, {
      headers: { ...requestHeaders, "content-type": "application/json" },
      data: {
        logo_media_id: state.originalSettings.logo_media_id,
        favicon_media_id: state.originalSettings.favicon_media_id,
        social_image_media_id: state.originalSettings.social_image_media_id,
        translations: state.originalSettings.translations,
      },
    });
    if (!restored.ok()) throw new Error("Could not restore the original site settings");
  });
  await cleanup("home page text", async () => {
    const restored = await apiRequest.put(
      `${state.appOrigin}/api/admin/site-blocks/home/hero_title`,
      {
        headers: { ...requestHeaders, "content-type": "application/json" },
        data: {
          translations: {
            en: { text: state.originalHeroTranslations.en },
            am: { text: state.originalHeroTranslations.am },
          },
        },
      },
    );
    if (!restored.ok()) throw new Error("Could not restore the original page text");
  });

  if (cleanupErrors.length > 0) {
    throw new Error(`Test cleanup failed: ${cleanupErrors.join("; ")}`);
  }
});

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
  const appOrigin = new URL(page.url()).origin;

  const originalSettings = await page.evaluate(async () => {
    const response = await fetch("/api/admin/site-settings");
    if (!response.ok) throw new Error("Could not save the original site settings for cleanup");
    return (await response.json()) as SiteSettingsSnapshot;
  });
  const originalHeroTranslations = await page.evaluate(async () => {
    const response = await fetch("/api/admin/site-blocks?page=home");
    if (!response.ok) throw new Error("Could not save the original page text for cleanup");
    const result = (await response.json()) as {
      items: Array<{
        key: string;
        translations?: { en?: { text: string }; am?: { text: string } };
      }>;
    };
    const block = result.items.find((item) => item.key === "hero_title");
    return {
      en: block?.translations?.en?.text ?? "",
      am: block?.translations?.am?.text ?? "",
    };
  });
  cleanupState = {
    appOrigin,
    originalSettings,
    originalHeroTranslations,
    slideCaptions: [
      englishSlideCaption,
      amharicSlideCaption,
      secondEnglishSlideCaption,
      secondAmharicSlideCaption,
    ],
    aboutCaptions: [englishAboutCaption, amharicAboutCaption],
  };
  const amharicPageTitle = `የዋና ገጽ ርዕስ ${suffix}`;
  await page.goto("/am/dashboard/page-content");
  const heroContent = page.locator(".site-block-card").filter({ hasText: "የዋና ገጽ ርዕስ" });
  await heroContent.getByLabel("አማርኛ", { exact: true }).fill(amharicPageTitle);
  await expect(heroContent.getByText("አንድ ቋንቋ ከጎደለ", { exact: false })).toBeVisible();
  await heroContent.getByRole("button", { name: "ለውጦቹን ያስቀምጡ" }).click();
  await expect(page.getByRole("status").filter({ hasText: "የገጽ ጽሑፉ ተቀምጧል" })).toBeVisible();
  for (const locale of ["am", "en"] as const) {
    await waitForPublicContent(
      page,
      `/${locale}`,
      page.getByRole("heading", { name: amharicPageTitle, exact: true }),
      90_000,
    );
  }

  await page.goto("/am/dashboard/page-content");
  const resetHeroContent = page.locator(".site-block-card").filter({ hasText: "የዋና ገጽ ርዕስ" });
  await resetHeroContent.getByRole("button", { name: "ወደ ነባሪ ይመልሱ" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "ወደ ነባሪ ይመልሱ", exact: true })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "የገጽ ጽሑፉ ተቀምጧል" })).toBeVisible();
  await expect(resetHeroContent.getByLabel("አማርኛ", { exact: true })).toHaveValue("");
  await expect(page.getByText("ያልተቀመጡ ለውጦች አሉ።", { exact: false })).toHaveCount(0);
  await waitForPublicContent(
    page,
    "/en",
    page.getByRole("heading", {
      name: "Small actions. Stronger neighborhoods.",
      exact: true,
    }),
    90_000,
  );

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
  await page.locator(".site-content-card").last().getByRole("button", { name: "ምስል ይምረጡ" }).click();
  picker = page.getByRole("dialog", { name: "ፎቶ ይምረጡ" });
  await picker.getByRole("button", { name: new RegExp(titles.share) }).click();
  await picker.getByRole("button", { name: "ይህን ፎቶ ይጠቀሙ" }).click();
  const newSlideCard = page.locator(".site-content-card").last();
  await newSlideCard.getByLabel("የእንግሊዝኛ መግለጫ").fill(secondEnglishSlideCaption);
  await newSlideCard.getByLabel("የአማርኛ መግለጫ").fill(secondAmharicSlideCaption);
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
    await slot.getByRole("button", { name: /ምስል ይምረጡ|ምስሉን ይቀይሩ/ }).click();
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

  await waitForPublicContent(
    page,
    "/en",
    page.getByText(secondEnglishSlideCaption, { exact: true }),
    90_000,
  );
  const carousel = page.getByRole("region", { name: "Featured images" });
  await expect(carousel.getByAltText(englishAlt).first()).toBeVisible({ timeout: 20_000 });
  await expect(carousel.getByRole("button", { name: "Previous image" })).toBeVisible();
  const pauseSlides = carousel.getByRole("button", { name: "Pause slideshow" });
  await expect(pauseSlides).toBeVisible();
  await pauseSlides.focus();
  await page.keyboard.press("Space");
  const resumeSlides = carousel.getByRole("button", { name: "Resume slideshow" });
  await expect(resumeSlides).toHaveAttribute("aria-pressed", "true");
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
  await waitForPublicContent(
    page,
    "/am",
    page.getByText(secondAmharicSlideCaption, { exact: true }),
    90_000,
  );
  const amharicCarousel = page.getByRole("region", { name: "ተመራጭ ምስሎች" });
  await expect(amharicCarousel.getByAltText(amharicAlt)).toBeVisible();
  await expect(amharicCarousel.getByRole("button", { name: "ራስ-ሰር እንቅስቃሴ ጠፍቷል" })).toBeVisible();
  const nextAmharicSlide = amharicCarousel.getByRole("button", { name: "ቀጣዩ ምስል" });
  await expect(nextAmharicSlide).toBeEnabled();
  await nextAmharicSlide.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(amharicSlideCaption, { exact: true })).toBeVisible();
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
    await waitForPublicContent(
      page,
      `/${locale}/about`,
      page.getByText(caption, { exact: true }),
      90_000,
    );
    await expect(page.getByAltText(locale === "en" ? englishAlt : amharicAlt)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
  }
});
