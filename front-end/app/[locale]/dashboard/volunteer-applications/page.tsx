"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type PageResponse } from "@/lib/api";
import { formatDate } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";

type Application = {
  id: number;
  name: string;
  email: string;
  skills: string;
  availability: string;
  message: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
  reviewed_at?: string;
  reviewer_name?: string;
};

export default function VolunteerApplicationsPage() {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const statusLabels = {
    pending: t("statusPendingLabel"),
    approved: t("statusApprovedLabel"),
    declined: t("statusDeclinedLabel"),
  };
  const { user } = useAuth();
  const [result, setResult] = useState<PageResponse<Application>>({
    items: [],
    page: 1,
    limit: 10,
    total: 0,
  });
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    setLoading(true);
    setError("");
    try {
      const filter = status ? `&status=${encodeURIComponent(status)}` : "";
      setResult(
        await apiFetch<PageResponse<Application>>(
          `/admin/volunteer-applications?page=${page}&limit=10${filter}`,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadApplicationsFailed"));
    } finally {
      setLoading(false);
    }
  }, [user, status, page, t]);
  useEffect(() => {
    void load();
  }, [load]);
  async function review(application: Application, nextStatus: "approved" | "declined") {
    setBusy(application.id);
    setError("");
    try {
      await apiFetch(`/admin/volunteer-applications/${application.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reviewApplicationFailed"));
    } finally {
      setBusy(null);
    }
  }
  if (user?.role !== "admin")
    return (
      <div className="status status-error" role="alert">
        {t("adminAccessRequired")}
      </div>
    );
  const pages = Math.max(1, Math.ceil(result.total / result.limit));
  return (
    <div>
      <PageHeader eyebrow={t("volunteersEyebrow")} title={t("applicationsTitle")} />
      <div className="field">
        <label htmlFor="application-status">{t("filterApplications")}</label>
        <select
          id="application-status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="pending">{t("statusPendingLabel")}</option>
          <option value="approved">{t("statusApprovedLabel")}</option>
          <option value="declined">{t("statusDeclinedLabel")}</option>
          <option value="">{t("allStatuses")}</option>
        </select>
      </div>
      {error && (
        <div className="status status-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-state" role="status">
          {t("loadingApplications")}
        </div>
      ) : result.items.length === 0 ? (
        <div className="empty-state">{t("noApplications")}</div>
      ) : (
        <div className="grid-2">
          {result.items.map((item) => (
            <article className="card" key={item.id}>
              <span className="badge">{statusLabels[item.status]}</span>
              <h2>{item.name}</h2>
              <p>{item.email}</p>
              <h3>{t("skills")}</h3>
              <p>{item.skills}</p>
              <h3>{t("availability")}</h3>
              <p>{item.availability}</p>
              {item.message && (
                <>
                  <h3>{t("applicationMessage")}</h3>
                  <p>{item.message}</p>
                </>
              )}
              <p className="meta">
                {t("received", { date: formatDate(item.created_at, false, locale) })}
              </p>
              {item.reviewer_name && (
                <p className="meta">{t("reviewedBy", { name: item.reviewer_name })}</p>
              )}
              {item.status === "pending" && (
                <div className="form-actions">
                  <button
                    className="btn btn-primary btn-small"
                    disabled={busy === item.id}
                    onClick={() => void review(item, "approved")}
                  >
                    {busy === item.id ? t("saving") : t("approve")}
                  </button>
                  <button
                    className="btn btn-outline btn-small"
                    disabled={busy === item.id}
                    onClick={() => void review(item, "declined")}
                  >
                    {t("decline")}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <nav className="form-actions dashboard-pagination" aria-label={t("applicationPages")}>
        <button
          className="btn btn-outline"
          disabled={page <= 1 || loading}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          {t("previous")}
        </button>
        <span className="meta">{t("pageOf", { page, total: pages })}</span>
        <button
          className="btn btn-outline"
          disabled={page >= pages || loading}
          onClick={() => setPage((value) => value + 1)}
        >
          {t("next")}
        </button>
      </nav>
    </div>
  );
}
