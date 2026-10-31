"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useApiWakeup } from "@/lib/use-api-wakeup";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const t = useTranslations("dashboard");
  const common = useTranslations("common");
  const isWaking = useApiWakeup();
  const pathname = usePathname();
  const router = useRouter();
  const [siteContentSaved, setSiteContentSaved] = useState(false);
  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login");
  }, [isLoading, user, router]);
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
  const item = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <div className="dashboard-shell">
      <header className="dashboard-topbar">
        <Link className="dashboard-brand" href="/dashboard">
          {t("brand")}
        </Link>
        <div className="dashboard-topbar-actions">
          <span className="badge">{t(`roles.${user.role}`)}</span>
          <LanguageSwitcher />
          <button type="button" className="btn btn-outline btn-small" onClick={out}>
            {t("logout")}
          </button>
        </div>
      </header>
      <div className="dashboard-layout">
        <aside className="dashboard-side" aria-label={t("navigation")}>
          {item("/", t("publicSite"))}
          {item("/dashboard", t("overview"))}
          {content && (
            <>
              {item("/dashboard/posts", t("posts"))}
              {item("/dashboard/events", t("events"))}
              {item("/dashboard/media", t("media"))}
              {item("/dashboard/messages", t("messages"))}
            </>
          )}
          {admin && (
            <>
              {item("/dashboard/home-slider", t("homeSliderTitle"))}
              {item("/dashboard/about-images", t("aboutImagesTitle"))}
              {item("/dashboard/branding", t("brandingTitle"))}
              {item("/dashboard/page-content", t("pageContentNav"))}
              {item("/dashboard/admin-guide", t("adminGuideNav"))}
              {item("/dashboard/users", t("users"))}
              {item("/dashboard/volunteers", t("volunteers"))}
              {item("/dashboard/volunteer-applications", t("applications"))}
            </>
          )}
          {item("/dashboard/profile", t("profile"))}
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
    </div>
  );
}
