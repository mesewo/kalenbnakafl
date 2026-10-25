import { expect, type Locator, type Page } from "@playwright/test";

export async function waitForPublicContent(page: Page, path: string, content: Locator) {
  await page.goto(path);
  await expect
    .poll(
      async () => {
        if ((await content.count()) > 0) return true;
        await page.reload();
        return (await content.count()) > 0;
      },
      { timeout: 75_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
}
