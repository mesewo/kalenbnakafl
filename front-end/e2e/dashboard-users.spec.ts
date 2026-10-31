import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import en from "../messages/en.json";
import am from "../messages/am.json";

test("admin can create, edit, and delete a user in both dashboard locales", async ({ page }) => {
  test.setTimeout(120_000);
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  expect(email, "ADMIN_EMAIL must be set").toBeTruthy();
  expect(password, "ADMIN_PASSWORD must be set").toBeTruthy();

  const suffix = randomUUID().slice(0, 8);
  await page.goto("/en/auth/login");
  await page.getByLabel(en.auth.email).fill(email!);
  await page.getByLabel(en.auth.password).fill(password!);
  await page.getByRole("button", { name: en.auth.login }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);

  for (const [locale, messages] of [
    ["en", en],
    ["am", am],
  ] as const) {
    const userName = `Dashboard regression ${locale} ${suffix}`;
    const editedName = `${userName} edited`;
    const userEmail = `dashboard-${locale}-${suffix}@example.invalid`;
    await page.goto(`/${locale}/dashboard/users`);

    await page.getByRole("button", { name: messages.dashboard.newUser }).click();
    const form = page.locator(".form-card");
    await expect(form).toBeVisible();
    await expect(form.getByRole("heading", { name: messages.dashboard.createUser })).toBeVisible();
    await form.getByLabel(messages.dashboard.name).fill(userName);
    await form.getByLabel(messages.dashboard.email).fill(userEmail);
    await form.getByLabel(messages.auth.password).fill("Bright-River-Community-2040!");
    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/admin/users"),
    );
    await form.getByRole("button", { name: messages.dashboard.createUser }).click();
    expect((await createResponse).status()).toBe(201);
    await expect(form).toHaveCount(0);

    let row = page.getByRole("row").filter({ hasText: userEmail });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: messages.dashboard.edit }).click();
    const editForm = page.locator(".form-card");
    await expect(
      editForm.getByRole("heading", { name: messages.dashboard.editUser }),
    ).toBeVisible();
    await editForm.getByLabel(messages.dashboard.name).fill(editedName);
    const updateResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/admin\/users\/\d+$/.test(new URL(response.url()).pathname),
    );
    await editForm.getByRole("button", { name: messages.dashboard.saveChanges }).click();
    expect((await updateResponse).status()).toBe(200);
    await expect(editForm).toHaveCount(0);

    row = page.getByRole("row").filter({ hasText: editedName });
    await expect(row).toContainText(userEmail);
    await row.getByRole("button", { name: messages.dashboard.delete }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toBeVisible();
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        /\/admin\/users\/\d+$/.test(new URL(response.url()).pathname),
    );
    await confirmation
      .getByRole("button", { name: messages.dashboard.delete, exact: true })
      .click();
    expect((await deleteResponse).status()).toBe(200);
    await expect(page.getByRole("row").filter({ hasText: userEmail })).toHaveCount(0);
  }
});
