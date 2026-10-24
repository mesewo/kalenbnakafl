"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login");
  }, [isLoading, user, router]);
  if (isLoading || !user)
    return (
      <div className="auth-wrap">
        <div className="empty-state">Checking your access…</div>
      </div>
    );
  const admin = user?.role === "admin";
  const editor = user?.role === "editor";
  const content = admin || editor;
  function out() {
    logout();
    router.push("/");
  }
  return (
    <div className="dashboard-shell">
      <header className="dashboard-topbar">
        <Link className="dashboard-brand" href="/dashboard">
          Kalen Benakafil / Workspace
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: ".8rem" }}>
          <span className="badge">{user?.role}</span>
          <button type="button" className="btn btn-outline btn-small" onClick={out}>
            Log out
          </button>
        </div>
      </header>
      <div className="dashboard-layout">
        <aside className="dashboard-side" aria-label="Dashboard navigation">
          <Link href="/" className="meta">
            ← Public site
          </Link>
          <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>
            Overview
          </Link>
          {content && (
            <>
              <Link
                href="/dashboard/posts"
                aria-current={pathname.startsWith("/dashboard/posts") ? "page" : undefined}
              >
                Posts
              </Link>
              <Link
                href="/dashboard/events"
                aria-current={pathname.startsWith("/dashboard/events") ? "page" : undefined}
              >
                Events
              </Link>
              <Link
                href="/dashboard/media"
                aria-current={pathname.startsWith("/dashboard/media") ? "page" : undefined}
              >
                Media
              </Link>{" "}
              <Link
                href="/dashboard/messages"
                aria-current={pathname.startsWith("/dashboard/messages") ? "page" : undefined}
              >
                Messages
              </Link>
            </>
          )}
          {admin && (
            <>
              <Link
                href="/dashboard/users"
                aria-current={pathname.startsWith("/dashboard/users") ? "page" : undefined}
              >
                Users
              </Link>
              <Link
                href="/dashboard/volunteers"
                aria-current={pathname.startsWith("/dashboard/volunteers") ? "page" : undefined}
              >
                Volunteers
              </Link>
            </>
          )}
          <Link
            href="/dashboard/profile"
            aria-current={pathname.startsWith("/dashboard/profile") ? "page" : undefined}
          >
            My profile
          </Link>
        </aside>
        <main className="dashboard-main" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
