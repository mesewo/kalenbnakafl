"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.d.ts";

type Application = components["schemas"]["VolunteerApplicationDTO"];
export default function VolunteerClient() {
  const t = useTranslations("volunteer");
  const common = useTranslations("common");
  const { user, isLoading: authLoading } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState({ skills: "", availability: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!user) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      setApplication(await apiFetch<Application>("/me/volunteer-application"));
    } catch (err) {
      if (err instanceof Error && "status" in err && err.status === 404) setApplication(null);
      else setError(err instanceof Error ? err.message : common("error"));
    } finally {
      setChecking(false);
    }
  }, [user, common]);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/me/volunteer-application", { method: "POST", body: JSON.stringify(form) });
      setNotice(t("submitted"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : common("error"));
    } finally {
      setLoading(false);
    }
  }
  const canApply = user?.role === "user" && !application;
  return (
    <main id="main-content">
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">{t("eyebrow")}</span>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
      </section>
      <section className="section">
        <div className="container grid-2">
          <div>
            <span className="eyebrow">{t("ways")}</span>
            <h2 className="display">{t("help")}</h2>
            <p className="lede">{t("description")}</p>
            {!authLoading && !user && (
              <div className="form-actions">
                <Link className="btn btn-primary" href="/auth/login?next=%2Fvolunteer">
                  {t("login")}
                </Link>
                <Link className="btn btn-outline" href="/auth/register">
                  {t("register")}
                </Link>
              </div>
            )}
            {user && checking && (
              <div className="empty-state" role="status">
                {t("checking")}
              </div>
            )}
            {user && application && (
              <div className="card card-accent">
                <h3>{t("status", { status: application.status })}</h3>
                <p>{t("existing")}</p>
              </div>
            )}
            {user && !checking && user.role !== "user" && !application && (
              <div className="status" role="status">
                {t("role", { role: user.role })}
              </div>
            )}
            {error && (
              <div className="status status-error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="status" role="status">
                {notice}
              </div>
            )}
            {canApply && (
              <form onSubmit={submit}>
                <div className="field">
                  <label htmlFor="volunteer-skills">{t("skills")}</label>
                  <textarea
                    id="volunteer-skills"
                    value={form.skills}
                    maxLength={2000}
                    required
                    onChange={(e) => setForm((v) => ({ ...v, skills: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="volunteer-availability">{t("availability")}</label>
                  <textarea
                    id="volunteer-availability"
                    value={form.availability}
                    maxLength={1000}
                    required
                    onChange={(e) => setForm((v) => ({ ...v, availability: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="volunteer-message">{t("extra")}</label>
                  <textarea
                    id="volunteer-message"
                    value={form.message}
                    maxLength={5000}
                    onChange={(e) => setForm((v) => ({ ...v, message: e.target.value }))}
                  />
                </div>
                <button className="btn btn-primary" disabled={loading}>
                  {loading ? t("submitting") : t("submit")}
                </button>
              </form>
            )}
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr" }}>
            <article className="card card-accent">
              <h3>{t("show")}</h3>
              <p>{t("showText")}</p>
            </article>
            <article className="card card-accent">
              <h3>{t("share")}</h3>
              <p>{t("shareText")}</p>
            </article>
            <article className="card card-accent">
              <h3>{t("conversation")}</h3>
              <p>{t("conversationText")}</p>
            </article>
          </div>
        </div>
      </section>
      <section className="cta-band section">
        <div className="container cta-row">
          <h2>{t("cta")}</h2>
          <Link href="/contact" className="btn btn-primary">
            {t("contact")}
          </Link>
        </div>
      </section>
    </main>
  );
}
