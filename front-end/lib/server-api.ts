import "server-only";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { withBuildFallback } from "./server-api-core.mjs";

const API_BASE = normalizeApiBase(process.env.API_INTERNAL_URL || "http://localhost:8080");
const PUBLIC_FETCH_TIMEOUT_MS = 10_000;

export class PublicApiError extends Error {
  constructor(readonly status: number) {
    super(`Public API request failed (${status})`);
    this.name = "PublicApiError";
  }
}

function isUnavailable(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) ||
    (error instanceof PublicApiError && error.status >= 500)
  );
}

export async function fetchPublic<T>(path: string, locale: "en" | "am"): Promise<T | null> {
  return withBuildFallback(
    async () => {
      const url = new URL(`${API_BASE}/api${path.startsWith("/") ? path : `/${path}`}`);
      url.searchParams.set("lang", locale);
      const response = await fetch(url, {
        headers: { "Accept-Language": locale },
        signal: AbortSignal.timeout(PUBLIC_FETCH_TIMEOUT_MS),
        next: { revalidate: 60 },
      });
      if (!response.ok) throw new PublicApiError(response.status);
      return (await response.json()) as T;
    },
    process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD,
    isUnavailable,
  );
}

function normalizeApiBase(value: string): string {
  const url = new URL(value);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new TypeError("API_INTERNAL_URL must be an HTTP(S) URL without credentials");
  }
  return url.toString().replace(/\/$/, "");
}
