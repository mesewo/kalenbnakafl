import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Noto_Sans_Ethiopic, Noto_Serif_Ethiopic, DM_Sans, Fraunces } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { routing } from "@/i18n/routing";
import "../globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: "variable",
  axes: ["opsz"],
});
const notoSans = Noto_Sans_Ethiopic({ subsets: ["ethiopic"], variable: "--font-noto-sans" });
const notoSerif = Noto_Serif_Ethiopic({ subsets: ["ethiopic"], variable: "--font-noto-serif" });

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
      <body
        className={`${sans.variable} ${serif.variable} ${notoSans.variable} ${notoSerif.variable}`}
      >
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
