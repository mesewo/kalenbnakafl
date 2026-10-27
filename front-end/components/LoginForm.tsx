"use client";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import AuthCard from "@/components/AuthCard";
import { useAuth } from "@/context/AuthContext";
import { useApiWakeup } from "@/lib/use-api-wakeup";
export default function LoginPage() {
  const t = useTranslations("auth");
  const common = useTranslations("common");
  const { login, user, isLoading } = useAuth();
  const isWaking = useApiWakeup();
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
      setError(err instanceof Error ? err.message : t("loginFailed"));
    } finally {
      setSubmitting(false);
    }
  }
  if (isLoading)
    return (
      <AuthCard title={t("checking")}>
        <p className="lede">{t("moment")}</p>
      </AuthCard>
    );
  return (
    <>
      <AuthCard title={t("welcome")} eyebrow={t("member")}>
        <form onSubmit={submit}>
          {isWaking && (
            <div className="status" role="status" aria-live="polite">
              {common("serverWaking")}
            </div>
          )}
          <div className="field">
            <label htmlFor="login-email">{t("email")}</label>
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
            <label htmlFor="login-password">{t("password")}</label>
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
            {submitting ? t("logging") : t("login")}
          </button>
        </form>
        <p className="meta" style={{ marginTop: "1.25rem" }}>
          {t("new")}{" "}
          <Link href="/auth/register" style={{ textDecoration: "underline" }}>
            {t("create")}
          </Link>
        </p>
      </AuthCard>
    </>
  );
}
