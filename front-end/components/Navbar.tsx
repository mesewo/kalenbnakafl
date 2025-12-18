"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const { token, user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <nav className="bg-primary text-black shadow">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Kalen Benakafil</h1>

        <div className="space-x-6 font-medium flex items-center">
          <Link href="/">Home</Link>
          <Link href="/about">About</Link>
          <Link href="/events">Events</Link>
          <Link href="/blog">News</Link>
          <Link href="/volunteer">Volunteer</Link>
          <Link href="/contact">Contact</Link>

          {token ? (
            <div className="flex items-center space-x-4 border-l pl-6">
              <span className="text-sm">{user?.name || "User"}</span>
              <Link href="/dashboard" className="bg-yellow-600 text-white px-3 py-1 rounded">
                Dashboard
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <Link href="/auth/login" className="bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700">
                Login
              </Link>
              <Link href="/auth/register" className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700">
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
