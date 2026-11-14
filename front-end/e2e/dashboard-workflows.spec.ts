import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import en from "../messages/en.json";
import am from "../messages/am.json";

type Locale = "en" | "am";

async function login(page: Page, locale: Locale, email: string, password: string) {
  const messages = locale === "en" ? en : am;
  await page.goto(`/${locale}/auth/login`);
  await page.getByLabel(messages.auth.email).fill(email);
  await page.getByLabel(messages.auth.password).fill(password);
  await page.getByRole("button", { name: messages.auth.login }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard`));
}

async function logout(page: Page) {
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/logout", { method: "POST" });
    return response.status;
  });
  expect(status, "logout request should succeed").toBe(200);
}

test("staff workflows update inbox, applications, and volunteer contributions in both locales", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  expect(adminEmail, "ADMIN_EMAIL must be set").toBeTruthy();
  expect(adminPassword, "ADMIN_PASSWORD must be set").toBeTruthy();

  const suffix = `${Date.now()}-${testInfo.workerIndex}-${randomUUID().slice(0, 8)}`;
  const applicantPassword = "Bright-River-Community-2040!";
  await login(page, "en", adminEmail!, adminPassword!);

  for (const locale of ["en", "am"] as const) {
    const messages = locale === "en" ? en : am;
    const email = `workflow-${locale}-${suffix}@example.invalid`;
    const name = `Workflow volunteer ${locale} ${suffix}`;
    const contactEmail = `workflow-contact-${locale}-${suffix}@example.invalid`;
    const contactName = `Workflow contact ${locale} ${suffix}`;

    await page.goto(`/${locale}/contact`);
    await page.getByLabel(messages.contact.name).fill(contactName);
    await page.getByLabel(messages.contact.emailLabel).fill(contactEmail);
    await page.getByLabel(messages.contact.message).fill(`Inbox workflow ${suffix}`);
    const contactResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/contact",
    );
    await page.getByRole("button", { name: messages.contact.send }).click();
    expect((await contactResponse).status()).toBe(201);
    await expect(page.getByText(messages.contact.success)).toBeVisible();

    const createUserResponse = await page.evaluate(
      async ({ email, name, password }) => {
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name, password, role: "user" }),
        });
        return response.status;
      },
      { email, name, password: applicantPassword },
    );
    expect(createUserResponse).toBe(201);

    await logout(page);
    await login(page, locale, email, applicantPassword);
    const volunteer = messages.volunteer;
    await page.goto(`/${locale}/volunteer`);
    await page.getByLabel(volunteer.skills).fill(`Community organizing ${suffix}`);
    await page.getByLabel(volunteer.availability).fill("Weekends");
    await page.getByLabel(volunteer.extra).fill(`Bilingual workflow ${suffix}`);
    const applicationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/me/volunteer-application",
    );
    await page.getByRole("button", { name: volunteer.submit }).click();
    expect((await applicationResponse).status()).toBe(201);
    await expect(page.getByText(volunteer.submitted)).toBeVisible();

    await logout(page);
    await login(page, locale, adminEmail!, adminPassword!);

    await page.goto(`/${locale}/dashboard/messages`);
    const messageRow = page.getByRole("row").filter({ hasText: contactEmail });
    await expect(messageRow).toBeVisible();
    const messageUpdate = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/staff\/contact-messages\/\d+$/.test(new URL(response.url()).pathname),
    );
    await messageRow.getByRole("button", { name: messages.dashboard.markReplied }).click();
    expect((await messageUpdate).status()).toBe(200);
    await expect(messageRow).toContainText(messages.dashboard.statusRepliedLabel);

    await page.goto(`/${locale}/dashboard/volunteer-applications`);
    const applicationCard = page.locator("article.card").filter({ hasText: email });
    await expect(applicationCard).toBeVisible();
    const reviewResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        /\/admin\/volunteer-applications\/\d+$/.test(new URL(response.url()).pathname),
    );
    await applicationCard.getByRole("button", { name: messages.dashboard.approve }).click();
    expect((await reviewResponse).status()).toBe(200);
    await expect(page.getByText(messages.dashboard.applicationApproved)).toBeVisible();

    await page.goto(`/${locale}/dashboard/volunteers`);
    const volunteerCard = page.locator("article.card").filter({ hasText: email });
    await expect(volunteerCard).toBeVisible();
    await volunteerCard
      .getByRole("button", { name: messages.dashboard.recordContribution })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(messages.dashboard.hours).fill("2");
    await dialog.getByLabel(messages.dashboard.notes).fill(`Workflow contribution ${suffix}`);
    const contributionResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/admin\/volunteers\/\d+\/contributions$/.test(new URL(response.url()).pathname),
    );
    await dialog.getByRole("button", { name: messages.dashboard.saveContribution }).click();
    expect((await contributionResponse).status()).toBe(201);
    await expect(page.getByText(messages.dashboard.contributionSaved)).toBeVisible();

    const deleteUserStatus = await page.evaluate(async (email) => {
      const usersResponse = await fetch("/api/admin/users");
      if (!usersResponse.ok) return usersResponse.status;
      const users = (await usersResponse.json()) as { id: number; email: string }[];
      const user = users.find((item) => item.email === email);
      if (!user) return 404;
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      return response.status;
    }, email);
    expect(deleteUserStatus).toBe(200);
  }
});
