import assert from "node:assert/strict";
import test from "node:test";
import { hasValidRevalidationSecret } from "./revalidation-auth.mjs";

test("revalidation route accepts only the configured secret", () => {
  assert.equal(hasValidRevalidationSecret("private-test-secret", "private-test-secret"), true);
  assert.equal(hasValidRevalidationSecret("private-test-secret", "wrong-secret"), false);
  assert.equal(hasValidRevalidationSecret("private-test-secret", ""), false);
  assert.equal(hasValidRevalidationSecret("", "private-test-secret"), false);
});
