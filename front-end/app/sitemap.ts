import type { MetadataRoute } from "next";
import { fetchPublic } from "@/lib/server-api";
import type { PageResponse, Post } from "@/lib/api";

const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://kalenbnakafl.org";
const pages = [
  "",
  "about",
  "events",
  "blog",
  "volunteer",
  "contact",
  "auth/login",
  "auth/register",
];
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of ["en", "am"] as const)
    for (const page of pages)
      entries.push({
        url: `${origin}/${locale}${page ? `/${page}` : ""}`,
        alternates: {
          languages: {
            en: `${origin}/en${page ? `/${page}` : ""}`,
            am: `${origin}/am${page ? `/${page}` : ""}`,
          },
        },
      });
  const posts = await fetchPublic<PageResponse<Post>>("/posts?limit=50", "en").catch(() => null);
  for (const post of posts?.items ?? [])
    for (const locale of ["en", "am"] as const)
      entries.push({
        url: `${origin}/${locale}/blog/${post.slug}`,
        alternates: {
          languages: { en: `${origin}/en/blog/${post.slug}`, am: `${origin}/am/blog/${post.slug}` },
        },
      });
  return entries;
}
