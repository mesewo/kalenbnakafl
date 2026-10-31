import { createHash, timingSafeEqual } from "node:crypto";

export function hasValidRevalidationSecret(expectedSecret, providedSecret) {
  if (!expectedSecret) return false;
  const expectedDigest = createHash("sha256").update(expectedSecret).digest();
  const providedDigest = createHash("sha256").update(providedSecret).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}
