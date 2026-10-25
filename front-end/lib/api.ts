import type { components } from "../types/api.d.ts";
import { intlLocale } from "@/i18n/locale";

export type UserRole = components["schemas"]["User"]["role"];
export type User = components["schemas"]["User"];
export type Post = components["schemas"]["Post"];
export type EventItem = components["schemas"]["Event"];
export type PageResponse<T> = Omit<components["schemas"]["Page"], "items"> & { items: T[] };
export type MediaItem = components["schemas"]["Media"];

export type ApiErrorBody = { code: string; message: string; details: Record<string, unknown> };
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const REQUEST_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 120000;
function getUrl(endpoint: string) {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) return endpoint;
  const base = API_URL.replace(/\/$/, "");
  return `${base}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}
function isApiErrorBody(value: unknown): value is { error: { code?: unknown; message?: unknown } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "object" &&
    (value as { error: { message?: unknown } }).error !== null
  );
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const locale =
    typeof document !== "undefined" && document.documentElement.lang === "am" ? "am" : "en";
  headers.set("Accept-Language", locale);
  const isUpload = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isUpload && options.body !== undefined && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = setTimeout(
    // eslint-disable-next-line no-restricted-syntax -- internal abort reason, not displayed to users
    () => controller.abort(new Error("Request timed out")),
    isUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
  );
  const cleanup = () => {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  };
  let response: Response;
  try {
    const requested = new URL(
      getUrl(endpoint),
      typeof window === "undefined" ? "http://localhost" : window.location.origin,
    );
    requested.searchParams.set("lang", locale);
    response = await fetch(requested.toString(), {
      ...options,
      headers,
      credentials: "include",
      signal: controller.signal,
    });
  } catch {
    const timedOut = controller.signal.aborted && !options.signal?.aborted;
    cleanup();
    throw new ApiError(
      timedOut
        ? "The request timed out. Please try again."
        : "We could not reach the service. Please check your connection and try again.",
      timedOut ? "timeout" : "network_error",
      0,
    );
  }
  try {
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      const errorBody = isApiErrorBody(payload) ? payload.error : null;
      const message =
        typeof errorBody?.message === "string"
          ? errorBody.message
          : "Something went wrong. Please try again.";
      const code =
        typeof errorBody?.code === "string"
          ? errorBody.code
          : response.status === 401
            ? "unauthorized"
            : "request_failed";
      if (
        response.status === 401 &&
        typeof window !== "undefined" &&
        !/(^|\/)(login|register|refresh)$/.test(endpoint.split("?")[0])
      )
        window.dispatchEvent(new Event("auth:session-expired"));
      throw new ApiError(message, code, response.status);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const timedOut = controller.signal.aborted && !options.signal?.aborted;
    throw new ApiError(
      timedOut
        ? "The request timed out. Please try again."
        : "The response could not be read. Please try again.",
      timedOut ? "timeout" : "response_error",
      response.status,
    );
  } finally {
    cleanup();
  }
}
export function formatDate(value?: string, withTime = false, locale = "en") {
  if (!value) return "Date to be announced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}
export function formatNumber(value: number, locale = "en") {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}
export function excerpt(value: string, length = 150) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length).trimEnd()}...` : clean;
}
