"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const { token, user, logout, isLoading } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  if (isLoading) {
    return (
      <nav className="bg-primary text-black shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">Kalen Benakafil</h1>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-primary text-black shadow">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold hover:opacity-80">
          Kalen Benakafil
        </Link>

        <div className="space-x-6 font-medium flex items-center">
          <Link href="/" className="hover:text-yellow-700">Home</Link>
          <Link href="/about" className="hover:text-yellow-700">About</Link>
          <Link href="/events" className="hover:text-yellow-700">Events</Link>
          <Link href="/blog" className="hover:text-yellow-700">News</Link>
          <Link href="/volunteer" className="hover:text-yellow-700">Volunteer</Link>
          <Link href="/contact" className="hover:text-yellow-700">Contact</Link>

          {token ? (
            <div className="flex items-center space-x-4 border-l pl-6">
              <span className="text-sm font-semibold">{user?.name || "User"}</span>
              <Link href="/dashboard" className="bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700">
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
