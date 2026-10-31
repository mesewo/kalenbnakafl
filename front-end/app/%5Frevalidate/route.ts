import { revalidatePath, revalidateTag } from "next/cache";
import { hasValidRevalidationSecret } from "@/lib/revalidation-auth.mjs";

export const dynamic = "force-dynamic";

const pathsByTag: Record<string, string[]> = {
  posts: ["/en", "/am", "/en/blog", "/am/blog", "/en/blog/[slug]", "/am/blog/[slug]"],
  events: ["/en", "/am", "/en/events", "/am/events", "/en/events/[id]", "/am/events/[id]"],
  "home-slides": ["/en", "/am"],
  "site-settings": ["/en", "/am"],
  "site-blocks": ["/en", "/am", "/en/about", "/am/about", "/en/contact", "/am/contact"],
  "about-images": ["/en/about", "/am/about"],
  media: [],
};
const allowedTags = new Set(Object.keys(pathsByTag));

export async function POST(request: Request) {
  const expectedSecret = process.env.REVALIDATE_SECRET;
  if (!expectedSecret) {
    return Response.json({ error: "Revalidation is not configured" }, { status: 503 });
  }
  const providedSecret = request.headers.get("x-revalidate-secret") ?? "";
  if (!hasValidRevalidationSecret(expectedSecret, providedSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || !("tags" in body) || !Array.isArray(body.tags)) {
    return Response.json({ error: "A tag list is required" }, { status: 400 });
  }
  const tags = [...new Set(body.tags.filter((tag): tag is string => typeof tag === "string"))];
  if (!tags.length || tags.some((tag) => !allowedTags.has(tag))) {
    return Response.json({ error: "Invalid cache tags" }, { status: 400 });
  }

  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
    for (const path of pathsByTag[tag]) {
      revalidatePath(path, "page");
    }
  }
  return Response.json({ revalidated: tags });
}
