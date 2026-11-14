"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatDate, type PageResponse } from "@/lib/api";
import { useToast } from "@/components/DashboardProviders";
import { queryKeys } from "@/lib/query-keys";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import { useOptimisticMutation } from "@/lib/use-optimistic-mutation";

type ContactStatus = "new" | "read" | "replied";
type ContactMessage = {
  id: number;
  name: string;
  email: string;
  message: string;
  status: ContactStatus;
  created_at: string;
  handled_by_name: string;
  handled_at?: string;
};
type StatusFilter = "" | ContactStatus;

export default function MessagesPage() {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const statusLabels: Record<ContactStatus, string> = {
    new: t("statusNewLabel"),
    read: t("statusReadLabel"),
    replied: t("statusRepliedLabel"),
  };
  const { user, isLoading: authLoading } = useAuth();
  const isStaff = user?.role === "admin" || user?.role === "editor";
  const showToast = useToast();
  const [status, setStatus] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState("");

  const messagesQuery = useQuery({
    queryKey: queryKeys.contactMessages(page, status),
    enabled: isStaff,
    queryFn: async () => {
      const query = new URLSearchParams({ page: String(page), limit: "10" });
      if (status) query.set("status", status);
      return apiFetch<PageResponse<ContactMessage>>(`/staff/contact-messages?${query}`);
    },
  });
  const messages = messagesQuery.data ?? { items: [], page, limit: 10, total: 0 };

  const updateMutation = useOptimisticMutation<
    PageResponse<ContactMessage>,
    { message: ContactMessage; nextStatus: "read" | "replied" }
  >({
    queryKey: queryKeys.contactMessages(page, status),
    invalidateQueryKey: queryKeys.contactMessages(),
    mutationFn: ({
      message,
      nextStatus,
    }: {
      message: ContactMessage;
      nextStatus: "read" | "replied";
    }) =>
      apiFetch(`/staff/contact-messages/${message.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      }),
    optimisticUpdate: (current, { message, nextStatus }) => {
      const removeFromFilter = Boolean(status && status !== nextStatus);
      return {
        ...current,
        items: removeFromFilter
          ? current.items.filter((item) => item.id !== message.id)
          : current.items.map((item) =>
              item.id === message.id ? { ...item, status: nextStatus } : item,
            ),
        total: current.total - Number(removeFromFilter),
      };
    },
    onError: (cause) => {
      const message = cause instanceof Error ? cause.message : t("updateMessageFailed");
      setError(message);
      showToast(message, "error");
    },
    onSuccess: () => {
      setError("");
      showToast(t("messageStatusUpdated"));
    },
  });

  function updateMessage(message: ContactMessage, nextStatus: "read" | "replied") {
    setError("");
    void updateMutation.mutate({ message, nextStatus });
  }

  if (authLoading) return <div className="empty-state">{t("checkingAccess")}</div>;
  if (!isStaff) return <div className="empty-state">{t("accessDenied")}</div>;

  return (
    <div>
      <PageHeader
        eyebrow={t("messagesEyebrow")}
        title={t("inbox")}
        action={
          <label className="field">
            <span>{t("filterStatus")}</span>
            <select
              id="message-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="">{t("allMessages")}</option>
              <option value="new">{t("statusNewLabel")}</option>
              <option value="read">{t("statusReadLabel")}</option>
              <option value="replied">{t("statusRepliedLabel")}</option>
            </select>
          </label>
        }
      />
      <DataTable
        rows={messages.items}
        rowKey={(message) => message.id}
        loading={messagesQuery.isPending}
        loadingLabel={t("loadingMessages")}
        error={
          error ||
          (messagesQuery.isError
            ? messagesQuery.error instanceof Error
              ? messagesQuery.error.message
              : t("loadMessagesFailed")
            : undefined)
        }
        emptyState={t("noMessages")}
        columns={[
          {
            id: "from",
            label: t("from"),
            header: t("from"),
            cell: (message) => {
              const isExpanded = expanded === message.id;
              return (
                <>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded(isExpanded ? null : message.id)}
                  >
                    {isExpanded ? t("hideMessage") : message.name}
                  </button>
                  <div className="meta">
                    <a href={`mailto:${message.email}`}>{message.email}</a>
                  </div>
                  {isExpanded && (
                    <div className="card dashboard-message-body">
                      {message.message}
                      {message.handled_by_name && (
                        <p className="meta">
                          {t("handledBy", { name: message.handled_by_name })}
                          {message.handled_at
                            ? ` · ${formatDate(message.handled_at, true, locale)}`
                            : ""}
                        </p>
                      )}
                    </div>
                  )}
                </>
              );
            },
            searchText: (message) => `${message.name} ${message.email} ${message.message}`,
            sortValue: (message) => message.name,
          },
          {
            id: "received",
            label: t("receivedLabel"),
            header: t("receivedLabel"),
            cell: (message) => formatDate(message.created_at, true, locale),
            sortValue: (message) => message.created_at,
          },
          {
            id: "status",
            label: t("status"),
            header: t("status"),
            cell: (message) => <StatusBadge>{statusLabels[message.status]}</StatusBadge>,
            sortValue: (message) => message.status,
          },
          {
            id: "actions",
            label: t("actions"),
            header: t("actions"),
            cell: (message) => (
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  disabled={updateMutation.isPending || message.status === "read"}
                  onClick={() => updateMessage(message, "read")}
                >
                  {t("markRead")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  disabled={updateMutation.isPending || message.status === "replied"}
                  onClick={() => updateMessage(message, "replied")}
                >
                  {t("markReplied")}
                </button>
              </div>
            ),
          },
        ]}
      />

      {!messagesQuery.isPending && messages.total > 0 && (
        <div className="form-actions dashboard-pagination" aria-label={t("messagePages")}>
          <button
            type="button"
            className="btn btn-outline btn-small"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t("previous")}
          </button>
          <span className="meta">
            {t("pageOf", {
              page: messages.page,
              total: Math.max(1, Math.ceil(messages.total / messages.limit)),
            })}
            {" · "}
            {t("messageCount", { count: messages.total })}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-small"
            disabled={page * messages.limit >= messages.total}
            onClick={() => setPage((current) => current + 1)}
          >
            {t("next")}
          </button>
        </div>
      )}
    </div>
  );
}
