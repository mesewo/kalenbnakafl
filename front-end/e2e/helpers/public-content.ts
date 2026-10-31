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
        await page.reload();
        return (await content.count()) > 0;
      },
      { timeout: Math.max(0, deadline - Date.now()), intervals: [100, 250, 500] },
    )
    .toBe(true);
}
