import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { routing } from "@/i18n/routing";
import { fetchOptionalSiteContent } from "@/lib/site-content";
import type { SiteSettings } from "@/lib/api";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  if (!hasLocale(routing.locales, requestedLocale)) notFound();
  const locale = requestedLocale;
  const [settings, common] = await Promise.all([
    fetchOptionalSiteContent<SiteSettings>("/site/settings", locale),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const brand = {
    logoUrl: settings?.logo_url ? `${settings.logo_url}?w=480` : null,
    siteName: settings?.site_name || common("brand"),
    tagline: settings?.tagline || common("community"),
  };
  return (
    <>
      <Navbar {...brand} />
      {children}
      <Footer {...brand} />
    </>
  );
}
