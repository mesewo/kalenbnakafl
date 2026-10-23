"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import { useAuth } from "@/context/AuthContext";
export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  function change(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password.length < 12) {
      setError("Choose a password with at least 12 characters.");
      return;
    }
    setLoading(true);
    try {
      await register(form);
      router.push("/auth/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthCard title="Join the work" eyebrow="Community membership">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="register-name">Full name</label>
          <input
            id="register-name"
            name="name"
            value={form.name}
            onChange={change}
            required
            autoComplete="name"
          />
        </div>
        <div className="field">
          <label htmlFor="register-email">Email address</label>
          <input
            id="register-email"
            name="email"
            type="email"
            value={form.email}
            onChange={change}
            required
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            name="password"
            type="password"
            value={form.password}
            onChange={change}
            required
            minLength={12}
            autoComplete="new-password"
          />
          <small>
            Use at least 12 characters. After creating an account, you can apply to volunteer.
          </small>
        </div>
        {error && (
          <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="meta" style={{ marginTop: "1.25rem" }}>
        Already have an account?{" "}
        <Link href="/auth/login" style={{ textDecoration: "underline" }}>
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
