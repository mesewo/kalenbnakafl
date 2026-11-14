import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import am from "../messages/am.json";

type Locale = "en" | "am";

async function login(page: Page, locale: Locale) {
  const messages = locale === "en" ? en : am;
  await page.goto(`/${locale}/auth/login`);
  await page.getByLabel(messages.auth.email).fill(process.env.ADMIN_EMAIL!);
  await page.getByLabel(messages.auth.password).fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: messages.auth.login }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard`));
}

test("profile edits use the shared dialog and protect unsaved changes in both locales", async ({
  page,
}) => {
  expect(process.env.ADMIN_EMAIL, "ADMIN_EMAIL must be set").toBeTruthy();
  expect(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD must be set").toBeTruthy();

  await login(page, "en");
  for (const locale of ["en", "am"] as const) {
    const messages = locale === "en" ? en : am;
    await page.goto(`/${locale}/dashboard/profile`);
    await page.getByRole("button", { name: messages.dashboard.edit }).click();

    const dialog = page.getByRole("dialog", { name: messages.dashboard.profile });
    await expect(dialog.getByText(messages.dashboard.passwordHint)).toBeVisible();
    await expect(
      dialog.getByLabel(messages.dashboard.newPassword, { exact: true }),
    ).toHaveAttribute("minlength", "12");
    await dialog.getByLabel(messages.dashboard.name).fill("Unsaved profile change");
    await dialog.getByRole("button", { name: messages.dashboard.cancel }).click();

    const discardDialog = page.getByRole("alertdialog");
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole("button", { name: messages.dashboard.cancel }).click();
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: messages.dashboard.cancel }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: messages.dashboard.discardChanges })
      .click();
    await expect(dialog).toHaveCount(0);
  }
});
