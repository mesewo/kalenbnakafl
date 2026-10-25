import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/en/dashboard", "/am/dashboard"] },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "https://kalenbnakafl.org"}/sitemap.xml`,
  };
}
