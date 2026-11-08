"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type PageResponse } from "@/lib/api";
import { formatDate } from "@/lib/api";
import { useToast } from "@/components/DashboardProviders";
import { queryKeys } from "@/lib/query-keys";
import PageHeader from "@/components/ui/PageHeader";
import SkeletonCards from "@/components/ui/SkeletonCards";

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
  const queryClient = useQueryClient();
  const showToast = useToast();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const applicationsQuery = useQuery({
    queryKey: queryKeys.volunteerApplications(page, status),
    enabled: user?.role === "admin",
    queryFn: async () => {
      const filter = status ? `&status=${encodeURIComponent(status)}` : "";
      return apiFetch<PageResponse<Application>>(
        `/admin/volunteer-applications?page=${page}&limit=10${filter}`,
      );
    },
  });
  const result = applicationsQuery.data ?? { items: [], page, limit: 10, total: 0 };
  const reviewMutation = useMutation({
    mutationFn: ({
      application,
      nextStatus,
    }: {
      application: Application;
      nextStatus: "approved" | "declined";
    }) =>
      apiFetch(`/admin/volunteer-applications/${application.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      }),
    onMutate: async ({ application, nextStatus }) => {
      const prefix = ["volunteer-applications"] as const;
      const queryKey = queryKeys.volunteerApplications(page, status);
      await queryClient.cancelQueries({ queryKey: prefix });
      const previous = queryClient.getQueryData<PageResponse<Application>>(queryKey);
      queryClient.setQueryData<PageResponse<Application>>(queryKey, (current) => {
        if (!current) return current;
        const removeFromFilter = Boolean(status && status !== nextStatus);
        return {
          ...current,
          items: removeFromFilter
            ? current.items.filter((item) => item.id !== application.id)
            : current.items.map((item) =>
                item.id === application.id ? { ...item, status: nextStatus } : item,
              ),
          total: current.total - Number(removeFromFilter),
        };
      });
      return { previous, prefix };
    },
    onError: (cause, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.volunteerApplications(page, status), context.previous);
      }
      const message = cause instanceof Error ? cause.message : t("reviewApplicationFailed");
      setError(message);
      showToast(message, "error");
    },
    onSuccess: (_data, variables) => {
      setError("");
      showToast(
        variables.nextStatus === "approved" ? t("applicationApproved") : t("applicationDeclined"),
      );
    },
    onSettled: (_data, _error, _variables, context) =>
      queryClient.invalidateQueries({
        queryKey: context?.prefix ?? ["volunteer-applications"],
      }),
  });
  function review(application: Application, nextStatus: "approved" | "declined") {
    setError("");
    void reviewMutation.mutate({ application, nextStatus });
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
      {applicationsQuery.isPending ? (
        <SkeletonCards label={t("loadingApplications")} />
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
                    disabled={reviewMutation.isPending}
                    onClick={() => void review(item, "approved")}
                  >
                    {reviewMutation.isPending &&
                    reviewMutation.variables?.application.id === item.id
                      ? t("saving")
                      : t("approve")}
                  </button>
                  <button
                    className="btn btn-outline btn-small"
                    disabled={reviewMutation.isPending}
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
          disabled={page <= 1 || applicationsQuery.isPending}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          {t("previous")}
        </button>
        <span className="meta">{t("pageOf", { page, total: pages })}</span>
        <button
          className="btn btn-outline"
          disabled={page >= pages || applicationsQuery.isPending}
          onClick={() => setPage((value) => value + 1)}
        >
          {t("next")}
        </button>
      </nav>
    </div>
  );
}
