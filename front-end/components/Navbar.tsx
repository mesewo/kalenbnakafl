"use client";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
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

export default function Navbar({
  logoUrl,
  siteName,
  tagline,
}: {
  logoUrl: string | null;
  siteName: string;
  tagline: string;
}) {
  const t = useTranslations("common");
  const nav = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const effectiveLogoUrl = logoUrl && !logoFailed ? logoUrl : "/kalenbnakafl-logo.jpg";
  function handleLogout() {
    logout();
    setOpen(false);
    router.push("/");
  }
  const langButton = <LanguageSwitcher />;
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("skip")}
      </a>
      <header className="site-header">
        <div className="nav-wrap">
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <Image
              className={
                effectiveLogoUrl !== "/kalenbnakafl-logo.jpg"
                  ? "brand-logo brand-logo-custom"
                  : "brand-logo"
              }
              src={effectiveLogoUrl}
              alt=""
              width={logoUrl ? 180 : 42}
              height={42}
              priority
              unoptimized
              onError={() => setLogoFailed(true)}
            />
            <span className="brand-copy">
              <strong>{siteName || t("brand")}</strong>
              <span>{tagline || t("community")}</span>
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
                  <Link href="/dashboard" className="btn btn-primary btn-small">
                    {t("dashboard")}
                  </Link>
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
                <Link href="/dashboard" onClick={() => setOpen(false)}>
                  {t("dashboard")}
                </Link>
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
