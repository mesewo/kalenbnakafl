import { expect, type Locator, type Page } from "@playwright/test";

export async function waitForPublicContent(
  page: Page,
  path: string,
  content: Locator,
  timeout = 75_000,
) {
  const deadline = Date.now() + timeout;
  await page.goto(path);
  await expect
    .poll(
      async () => {
        if ((await content.count()) > 0) return true;
        try {
          await page.reload({ waitUntil: "domcontentloaded" });
        } catch {
          // Guard against transient reload detachment during cross-page transitions
        }
        return (await content.count()) > 0;
      },
      { timeout: Math.max(0, deadline - Date.now()), intervals: [1000, 2000, 4000] },
    )
    .toBe(true);
}
