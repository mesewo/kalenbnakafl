"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { token, user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!token) router.push("/auth/login");
  }, [token, router]);

  if (!token) return null;

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // Determine which nav items to show based on user role
  const isAdmin = user?.role === "admin";
  const isEditor = user?.role === "editor";
  const isAdminOrEditor = isAdmin || isEditor;

  return (
    <div className="flex min-h-screen bg-yellow-50">
      <aside className="w-64 bg-yellow-600 text-white p-4 space-y-6">
        <div>
          <h2 className="text-xl font-bold">Dashboard</h2>
          <p className="text-sm text-yellow-100">{user?.name || "User"}</p>
          <p className="text-xs text-yellow-200 mt-1 capitalize">{user?.role}</p>
        </div>

        <nav className="space-y-3">
          <Link href="/dashboard" className="block hover:bg-yellow-700 p-2 rounded">
            Overview
          </Link>

          {/* Admin/Editor only sections */}
          {isAdminOrEditor && (
            <>
              <Link href="/dashboard/posts" className="block hover:bg-yellow-700 p-2 rounded">
                Posts
              </Link>
              <Link href="/dashboard/events" className="block hover:bg-yellow-700 p-2 rounded">
                Events
              </Link>
              <Link href="/dashboard/media" className="block hover:bg-yellow-700 p-2 rounded">
                Media
              </Link>
            </>
          )}

          {/* Admin only sections */}
          {isAdmin && (
            <>
              <Link href="/dashboard/users" className="block hover:bg-yellow-700 p-2 rounded">
                Users
              </Link>
              <Link href="/dashboard/volunteers" className="block hover:bg-yellow-700 p-2 rounded">
                Volunteers
              </Link>
            </>
          )}
        </nav>

        <button
          onClick={handleLogout}
          className="w-full bg-red-600 hover:bg-red-700 p-2 rounded"
        >
          Logout
        </button>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
