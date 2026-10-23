"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import { useAuth } from "@/context/AuthContext";
export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (!isLoading && user) router.replace("/dashboard");
  }, [isLoading, user, router]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not log you in.");
    } finally {
      setSubmitting(false);
    }
  }
  if (isLoading)
    return (
      <AuthCard title="Checking access…">
        <p className="lede">One moment.</p>
      </AuthCard>
    );
  return (
    <>
      <AuthCard title="Welcome back" eyebrow="Member access">
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p className="meta" style={{ marginTop: "1.25rem" }}>
          New to Kalen Benakafil?{" "}
          <Link href="/auth/register" style={{ textDecoration: "underline" }}>
            Create an account
          </Link>
        </p>
      </AuthCard>
    </>
  );
}
