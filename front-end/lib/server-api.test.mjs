import assert from "node:assert/strict";
import test from "node:test";
import { withBuildFallback, withEmptyArrayOnFailure } from "./server-api-core.mjs";

test("public fetch failures during production build become an empty fallback", async () => {
  const result = await withBuildFallback(
    async () => {
      throw new TypeError("API is asleep");
    },
    true,
    () => true,
  );

  assert.equal(result, null);
});

test("public fetch failures at runtime propagate so ISR retains its last good page", async () => {
  const apiFailure = new Error("API is asleep");
  await assert.rejects(
    withBuildFallback(
      async () => {
        throw apiFailure;
      },
      false,
      () => true,
    ),
    apiFailure,
  );
});

test("unexpected errors still fail a production build", async () => {
  const programmingError = new SyntaxError("Invalid API response");
  await assert.rejects(
    withBuildFallback(
      async () => {
        throw programmingError;
      },
      true,
      () => false,
    ),
    programmingError,
  );
});

test("failed static-param requests return no params and leave dynamic routes available", async () => {
  const result = await withEmptyArrayOnFailure(async () => {
    throw new Error("API is asleep");
  });

  assert.deepEqual(result, []);
});
