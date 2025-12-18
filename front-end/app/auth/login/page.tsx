"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-yellow-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl shadow w-80"
      >
        <h1 className="text-xl font-bold mb-4">Login</h1>

        {error && <p className="text-red-500">{error}</p>}

        <input
          className="border p-2 w-full mb-3"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="border p-2 w-full mb-4"
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="bg-yellow-500 text-white w-full py-2 rounded">
          Login
        </button>
      </form>
    </div>
  );
}
