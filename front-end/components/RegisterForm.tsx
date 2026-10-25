"use client";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import AuthCard from "@/components/AuthCard";
import { useAuth } from "@/context/AuthContext";
export default function RegisterPage() {
  const t = useTranslations("auth");
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
      setError(t("shortPassword"));
      return;
    }
    setLoading(true);
    try {
      await register(form);
      router.push("/auth/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("registerFailed"));
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthCard title={t("join")} eyebrow={t("membership")}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="register-name">{t("name")}</label>
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
          <label htmlFor="register-email">{t("email")}</label>
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
          <label htmlFor="register-password">{t("password")}</label>
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
          <small>{t("passwordRule")}</small>
        </div>
        {error && (
          <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
          {loading ? t("creating") : t("register")}
        </button>
      </form>
      <p className="meta" style={{ marginTop: "1.25rem" }}>
        {t("already")}{" "}
        <Link href="/auth/login" style={{ textDecoration: "underline" }}>
          {t("login")}
        </Link>
      </p>
    </AuthCard>
  );
}
