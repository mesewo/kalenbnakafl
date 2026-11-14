"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { useApiWakeup } from "@/lib/use-api-wakeup";
import Icon, { type IconName } from "@/components/ui/Icon";

type DashboardLink = { href: string; label: string; icon: IconName };

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const t = useTranslations("dashboard");
  const common = useTranslations("common");
  const isWaking = useApiWakeup();
  const pathname = usePathname();
  const router = useRouter();
  const [siteContentSaved, setSiteContentSaved] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileNavigationTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login");
  }, [isLoading, user, router]);
  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavigationOpen(false);
        mobileNavigationTrigger.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavigationOpen]);
  useEffect(() => {
    const showLiveStatus = () => {
      setSiteContentSaved(true);
      window.setTimeout(() => setSiteContentSaved(false), 10_000);
    };
    window.addEventListener("site-content-saved", showLiveStatus);
    return () => window.removeEventListener("site-content-saved", showLiveStatus);
  }, []);
  if (isLoading || !user) {
    return (
      <div className="auth-wrap">
        <div className="empty-state">{t("checkingAccess")}</div>
        {isWaking && (
          <p role="status" aria-live="polite">
            {common("serverWaking")}
          </p>
        )}
      </div>
    );
  }
  const admin = user.role === "admin";
  const content = admin || user.role === "editor";
  async function out() {
    await logout();
    router.push("/");
  }
  const links: DashboardLink[] = [
    { href: "/", label: t("publicSite"), icon: "public" },
    { href: "/dashboard", label: t("overview"), icon: "home" },
  ];
  if (content) {
    links.push(
      { href: "/dashboard/posts", label: t("posts"), icon: "posts" },
      { href: "/dashboard/events", label: t("events"), icon: "events" },
      { href: "/dashboard/media", label: t("media"), icon: "media" },
      { href: "/dashboard/messages", label: t("messages"), icon: "messages" },
    );
  }
  if (admin) {
    links.push(
      { href: "/dashboard/home-slider", label: t("homeSliderTitle"), icon: "slider" },
      { href: "/dashboard/about-images", label: t("aboutImagesTitle"), icon: "gallery" },
      { href: "/dashboard/branding", label: t("brandingTitle"), icon: "branding" },
      { href: "/dashboard/page-content", label: t("pageContentNav"), icon: "content" },
      { href: "/dashboard/admin-guide", label: t("adminGuideNav"), icon: "guide" },
      { href: "/dashboard/users", label: t("users"), icon: "users" },
      { href: "/dashboard/volunteers", label: t("volunteers"), icon: "volunteers" },
      { href: "/dashboard/volunteer-applications", label: t("applications"), icon: "applications" },
    );
  }
  links.push({ href: "/dashboard/profile", label: t("profile"), icon: "profile" });
  const item = ({ href, label, icon }: DashboardLink) => (
    <Link
      key={href}
      className="dashboard-nav-link"
      href={href}
      aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
      onClick={() => setMobileNavigationOpen(false)}
    >
      <Icon name={icon} />
      {label}
    </Link>
  );
  const mobilePrimaryLinks = content
    ? links.filter((link) =>
        ["/dashboard", "/dashboard/posts", "/dashboard/events"].includes(link.href),
      )
    : links.filter((link) => ["/dashboard", "/", "/dashboard/profile"].includes(link.href));
  return (
    <div className="dashboard-shell">
      <header className="dashboard-topbar">
        <Link className="dashboard-brand" href="/dashboard">
          {t("brand")}
        </Link>
        <div className="dashboard-topbar-actions">
          <span className={`badge role-badge role-${user.role}`}>{t(`roles.${user.role}`)}</span>
          <ThemeToggle />
          <LanguageSwitcher />
          <button type="button" className="btn btn-outline btn-small" onClick={out}>
            {t("logout")}
          </button>
        </div>
      </header>
      <div className="dashboard-layout">
        <aside className="dashboard-side" aria-label={t("navigation")}>
          {links.map(item)}
        </aside>
        <main className="dashboard-main" id="main-content">
          {siteContentSaved && (
            <div className="status dashboard-status" role="status">
              {t("liveOnSite")}{" "}
              <Link href="/" className="text-link">
                {t("viewOnSite")}
              </Link>
            </div>
          )}
          {isWaking && (
            <div className="status dashboard-status" role="status" aria-live="polite">
              {common("serverWaking")}
            </div>
          )}
          {children}
        </main>
      </div>
      {mobileNavigationOpen && (
        <>
          <button
            type="button"
            className="dashboard-mobile-backdrop"
            aria-label={t("closeDashboardNav")}
            onClick={() => setMobileNavigationOpen(false)}
          />
        </>
      )}
      <nav
        className="dashboard-mobile-drawer"
        id="dashboard-mobile-navigation"
        aria-label={t("navigation")}
        hidden={!mobileNavigationOpen}
      >
        {links.map(item)}
        <div className="drawer-theme-row">
          <span>{common("appearance")}</span>
          <ThemeToggle />
        </div>
      </nav>
      <nav className="dashboard-bottom-nav" aria-label={t("mobileNavigation")}>
        {mobilePrimaryLinks.map(item)}
        <button
          ref={mobileNavigationTrigger}
          type="button"
          aria-expanded={mobileNavigationOpen}
          aria-controls="dashboard-mobile-navigation"
          aria-label={mobileNavigationOpen ? t("closeDashboardNav") : t("openDashboardNav")}
          onClick={() => setMobileNavigationOpen((open) => !open)}
        >
          <Icon name="content" />
          <span>{mobileNavigationOpen ? t("closeMenu") : t("moreSections")}</span>
        </button>
      </nav>
    </div>
  );
}
