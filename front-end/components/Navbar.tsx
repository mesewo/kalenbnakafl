"use client";
import Image from "next/image";
import NextLink from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

const links = [
  ["/", "home"],
  ["/about", "about"],
  ["/events", "events"],
  ["/blog", "news"],
  ["/volunteer", "volunteer"],
  ["/contact", "contact"],
] as const;

export default function Navbar() {
  const t = useTranslations("common");
  const nav = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const nextLocale = locale === "en" ? "am" : "en";
  function switchLanguage() {
    router.replace(pathname, { locale: nextLocale });
    setOpen(false);
  }
  function handleLogout() {
    logout();
    setOpen(false);
    router.push("/");
  }
  const langButton = (
    <button
      type="button"
      className="btn btn-outline btn-small"
      onClick={switchLanguage}
      aria-label={locale === "en" ? t("amharic") : t("english")}
    >
      {locale === "en" ? t("amharic") : t("english")}
    </button>
  );
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("skip")}
      </a>
      <header className="site-header">
        <div className="nav-wrap">
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <Image src="/kalenbnakafl-logo.jpg" alt={t("brand")} width={42} height={42} priority />
            <span className="brand-copy">
              <strong>{t("brand")}</strong>
              <span>{t("community")}</span>
            </span>
          </Link>
          <nav className="nav-links" aria-label={nav("primary")}>
            {links.map(([href, key]) => (
              <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
                {t(key)}
              </Link>
            ))}
          </nav>
          {!isLoading && (
            <div className="nav-actions">
              {user ? (
                <>
                  <span className="meta">
                    {nav("hello", { name: user.name?.split(" ")[0] || "" })}
                  </span>
                  <NextLink href="/dashboard" className="btn btn-primary btn-small">
                    {t("dashboard")}
                  </NextLink>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="btn btn-outline btn-small"
                  >
                    {t("logout")}
                  </button>
                </>
              ) : (
                <>
                  <Link href="/auth/login" className="btn btn-outline btn-small">
                    {t("login")}
                  </Link>
                  <Link href="/auth/register" className="btn btn-sun btn-small">
                    {t("register")}
                  </Link>
                </>
              )}
              {langButton}
            </div>
          )}
          <button
            className="nav-menu"
            type="button"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label={open ? nav("close") : nav("open")}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "×" : "☰"}
          </button>
        </div>
        {open && (
          <nav id="mobile-navigation" className="mobile-nav" aria-label={nav("mobile")}>
            {links.map(([href, key]) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {t(key)}
              </Link>
            ))}
            {user ? (
              <>
                <NextLink href="/dashboard" onClick={() => setOpen(false)}>
                  {t("dashboard")}
                </NextLink>
                <button className="btn btn-outline" onClick={handleLogout}>
                  {t("logout")}
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" onClick={() => setOpen(false)}>
                  {t("login")}
                </Link>
                <Link href="/auth/register" onClick={() => setOpen(false)}>
                  {t("register")}
                </Link>
              </>
            )}
            {langButton}
          </nav>
        )}
      </header>
    </>
  );
}
