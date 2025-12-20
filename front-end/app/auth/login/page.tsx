"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function LoginPage() {
  const { login, token, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (!isLoading && token) {
      router.push("/dashboard");
    }
  }, [token, isLoading, router]);

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center bg-yellow-100">
          <p>Loading...</p>
        </div>
        <Footer />
      </>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen flex items-center justify-center bg-yellow-100">
        <form
          onSubmit={handleSubmit}
          className="bg-white p-6 rounded-xl shadow w-80"
        >
          <h1 className="text-xl font-bold mb-4">Login</h1>

          {error && (
            <p className="text-red-500 mb-4 text-sm bg-red-50 p-2 rounded">
              {error}
            </p>
          )}

          <input
            type="email"
            className="border p-2 w-full mb-3 rounded"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="border p-2 w-full mb-4 rounded"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-yellow-500 text-white w-full py-2 rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Logging in..." : "Login"}
          </button>

          <p className="text-sm text-center mt-4">
            Don't have an account?{" "}
            <a href="/auth/register" className="text-blue-600 hover:underline">
              Register here
            </a>
          </p>
        </form>
      </div>
      <Footer />
    </>
  );
}
