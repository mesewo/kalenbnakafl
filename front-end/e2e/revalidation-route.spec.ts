import { expect, test } from "@playwright/test";

test("the public cache revalidation route rejects requests without its secret", async ({
  request,
}) => {
  const response = await request.post("/_revalidate", {
    data: { tags: ["posts"] },
  });
  expect(response.status()).toBe(process.env.REVALIDATE_SECRET ? 401 : 503);
});

test("the public cache revalidation route accepts a valid secret", async ({ request }) => {
  test.skip(!process.env.REVALIDATE_SECRET, "REVALIDATE_SECRET is not configured in this test run");
  const response = await request.post("/_revalidate", {
    headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET! },
    data: { tags: ["posts"] },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ revalidated: ["posts"] });
});
