import "server-only";

const API_BASE = (process.env.API_INTERNAL_URL || "http://localhost:8080").replace(/\/$/, "");

export async function fetchPublic<T>(path: string, locale: "en" | "am"): Promise<T> {
  const url = new URL(`${API_BASE}/api${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("lang", locale);
  const response = await fetch(url, {
    headers: { "Accept-Language": locale },
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error(`Public API request failed (${response.status})`);
  return (await response.json()) as T;
}
