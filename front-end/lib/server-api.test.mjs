import assert from "node:assert/strict";
import test from "node:test";
import { withBuildFallback, withEmptyArrayOnFailure } from "./server-api-core.mjs";
import { platformForwardingHeaders } from "./platform-forwarding.mjs";

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

test("platform forwarding removes caller headers and adds the verified Vercel client IP", () => {
  const source = new Headers({
    "x-forwarded-for": "spoofed",
    "x-vercel-forwarded-for": "198.51.100.8",
    "x-platform-client-ip": "spoofed",
    "x-platform-forwarder-token": "spoofed",
    authorization: "Bearer token",
  });

  const headers = platformForwardingHeaders(source, {
    enabled: true,
    clientIP: source.get("x-vercel-forwarded-for"),
    token: "server-only-secret",
  });

  assert.equal(headers.get("x-forwarded-for"), null);
  assert.equal(headers.get("x-vercel-forwarded-for"), null);
  assert.equal(headers.get("x-platform-client-ip"), "198.51.100.8");
  assert.equal(headers.get("x-platform-forwarder-token"), "server-only-secret");
  assert.equal(headers.get("authorization"), "Bearer token");
});

test("platform forwarding strips caller headers when trust is disabled or incomplete", () => {
  const source = new Headers({
    "x-vercel-forwarded-for": "198.51.100.8",
    "x-platform-client-ip": "spoofed",
    "x-platform-forwarder-token": "spoofed",
  });

  for (const options of [
    { enabled: false, clientIP: "198.51.100.8", token: "server-only-secret" },
    { enabled: true, clientIP: "198.51.100.8", token: undefined },
  ]) {
    const headers = platformForwardingHeaders(source, options);
    assert.equal(headers.get("x-vercel-forwarded-for"), null);
    assert.equal(headers.get("x-platform-client-ip"), null);
    assert.equal(headers.get("x-platform-forwarder-token"), null);
  }
});
