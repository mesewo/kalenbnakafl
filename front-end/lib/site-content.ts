import "server-only";
import { fetchPublic } from "@/lib/server-api";

export async function fetchOptionalSiteContent<T>(
  path: string,
  locale: "en" | "am",
): Promise<T | null> {
  try {
    return await fetchPublic<T>(path, locale);
  } catch (error) {
    console.error(`Could not load public site content from ${path}`, error);
    return null;
  }
}
