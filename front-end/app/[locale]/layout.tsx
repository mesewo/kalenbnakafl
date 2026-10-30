import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { AuthProvider } from "@/context/AuthContext";
import { routing } from "@/i18n/routing";
import { fetchOptionalSiteContent } from "@/lib/site-content";
import { siteOrigin } from "@/lib/metadata";
import type { SiteSettings } from "@/lib/api";
import "../globals.css";

type Locale = "en" | "am";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  if (!hasLocale(routing.locales, requestedLocale)) return {};
  const locale = requestedLocale as Locale;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const settings = await fetchOptionalSiteContent<SiteSettings>("/site/settings", locale);
  const siteName = settings?.site_name || t("brand");
  const tagline = settings?.tagline || t("description");
  const imageURL = settings?.social_image_url
    ? new URL(`${settings.social_image_url}?w=1600`, siteOrigin).toString()
    : new URL("/kalenbnakafl-logo.jpg", siteOrigin).toString();
  const faviconURL = settings?.favicon_url
    ? new URL(`${settings.favicon_url}?w=480`, siteOrigin).toString()
    : "/kalenbnakafl-logo.jpg";
  return {
    metadataBase: new URL(siteOrigin),
    title: { default: siteName, template: `%s | ${siteName}` },
    description: tagline,
    icons: { icon: faviconURL, apple: faviconURL },
    openGraph: {
      type: "website",
      locale: locale === "am" ? "am_ET" : "en_US",
      siteName,
      title: siteName,
      description: tagline,
      images: [{ url: imageURL, alt: siteName }],
    },
    twitter: {
      card: "summary_large_image",
      title: siteName,
      description: tagline,
      images: [{ url: imageURL, alt: siteName }],
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
