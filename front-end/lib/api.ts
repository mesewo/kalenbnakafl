import type { components } from "../types/api.d.ts";
import { intlLocale } from "@/i18n/locale";
import enMessages from "@/messages/en.json";
import amMessages from "@/messages/am.json";

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
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";
const REQUEST_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 120000;
const MAX_WAKEUP_RETRIES = 3;
const WAKEUP_BACKOFF_MS = [500, 1000, 2000] as const;
let apiWakeupRequests = 0;
function getUrl(endpoint: string) {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) return endpoint;
  const base = API_URL.replace(/\/$/, "");
  return `${base}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}
function isApiErrorBody(
  value: unknown,
): value is { error: { code?: unknown; message?: unknown; details?: unknown } } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "object" &&
    (value as { error: { message?: unknown } }).error !== null
  );
}

function notifyApiWakeup(active: boolean) {
  if (typeof window !== "undefined") {
    apiWakeupRequests = Math.max(0, apiWakeupRequests + (active ? 1 : -1));
    window.dispatchEvent(
      new CustomEvent("api:waking", { detail: { active: apiWakeupRequests > 0 } }),
    );
  }
}

function waitBeforeRetry(delayMs: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Request aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function isWakeupStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const locale =
    typeof document !== "undefined" && document.documentElement.lang === "am" ? "am" : "en";
  const commonMessages = locale === "am" ? amMessages.common : enMessages.common;
  headers.set("Accept-Language", locale);
  const isUpload = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isUpload && options.body !== undefined && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  let retrying = false;
  let finalMessage = commonMessages.serviceUnavailable;
  try {
    const requested = new URL(
      getUrl(endpoint),
      typeof window === "undefined" ? "http://localhost" : window.location.origin,
    );
    requested.searchParams.set("lang", locale);
    for (let attempt = 0; attempt <= MAX_WAKEUP_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const forwardAbort = () => controller.abort(options.signal?.reason);
      if (options.signal?.aborted) forwardAbort();
      else options.signal?.addEventListener("abort", forwardAbort, { once: true });
      const timeout = setTimeout(
        // eslint-disable-next-line no-restricted-syntax -- internal abort reason, not displayed to users
        () => controller.abort(new Error("Request timed out")),
        isUpload ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
      );
      let response: Response;
      try {
        response = await fetch(requested.toString(), {
          ...options,
          headers,
          credentials: "include",
          signal: controller.signal,
        });
      } catch {
        const timedOut = controller.signal.aborted && !options.signal?.aborted;
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", forwardAbort);
        if (options.signal?.aborted)
          throw new ApiError(commonMessages.serviceUnavailable, "aborted", 0);
        finalMessage = timedOut
          ? commonMessages.requestTimedOut
          : commonMessages.serviceUnavailable;
        if (attempt < MAX_WAKEUP_RETRIES) {
          if (!retrying) {
            retrying = true;
            notifyApiWakeup(true);
          }
          await waitBeforeRetry(
            WAKEUP_BACKOFF_MS[Math.min(attempt, WAKEUP_BACKOFF_MS.length - 1)],
            options.signal,
          );
          continue;
        }
        throw new ApiError(finalMessage, timedOut ? "timeout" : "service_unavailable", 0);
      }
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", forwardAbort);
      if (isWakeupStatus(response.status)) {
        finalMessage = commonMessages.serviceUnavailable;
        if (attempt < MAX_WAKEUP_RETRIES) {
          if (!retrying) {
            retrying = true;
            notifyApiWakeup(true);
          }
          await waitBeforeRetry(
            WAKEUP_BACKOFF_MS[Math.min(attempt, WAKEUP_BACKOFF_MS.length - 1)],
            options.signal,
          );
          continue;
        }
        throw new ApiError(finalMessage, "service_unavailable", response.status);
      }

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
          typeof errorBody?.message === "string" ? errorBody.message : commonMessages.error;
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
        const details =
          typeof errorBody?.details === "object" && errorBody.details !== null
            ? (errorBody.details as Record<string, unknown>)
            : {};
        throw new ApiError(message, code, response.status, details);
      }
      return payload as T;
    }
    throw new ApiError(finalMessage, "service_unavailable", 0);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(finalMessage, "service_unavailable", 0);
  } finally {
    if (retrying) notifyApiWakeup(false);
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
