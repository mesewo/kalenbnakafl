"use client";

import { useAuth } from "@/context/AuthContext";

export default function DashboardHeader() {
  const { logout } = useAuth();

  return (
    <header className="bg-white shadow px-6 py-4 flex justify-between items-center">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <button
        onClick={logout}
        className="bg-primaryDark px-4 py-2 rounded font-medium"
      >
        Logout
      </button>
    </header>
  );
}
