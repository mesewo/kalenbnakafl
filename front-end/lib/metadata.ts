import type { Metadata } from "next";

export const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://kalenbnakafl.org";
export function localizedMetadata(
  locale: "en" | "am",
  path: string,
  title: string,
  description: string,
): Metadata {
  const suffix = path === "/" ? "" : path;
  const localized = (lang: string) => `${siteOrigin}/${lang}${suffix}`;
  return {
    title,
    description,
    alternates: {
      canonical: localized(locale),
      languages: { en: localized("en"), am: localized("am"), "x-default": localized("en") },
    },
  };
}
