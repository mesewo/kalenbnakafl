"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatDate, type PageResponse } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";

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
  const [messages, setMessages] = useState<PageResponse<ContactMessage>>({
    items: [],
    page: 1,
    limit: 10,
    total: 0,
  });
  const [status, setStatus] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), limit: "10" });
    if (status) query.set("status", status);
    try {
      setMessages(await apiFetch<PageResponse<ContactMessage>>(`/staff/contact-messages?${query}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadMessagesFailed"));
    } finally {
      setLoading(false);
    }
  }, [isStaff, page, status, t]);

  useEffect(() => {
    if (isStaff) void load();
  }, [isStaff, load]);

  async function updateMessage(message: ContactMessage, nextStatus: "read" | "replied") {
    setUpdating(message.id);
    setError("");
    try {
      await apiFetch(`/staff/contact-messages/${message.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("updateMessageFailed"));
    } finally {
      setUpdating(null);
    }
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
        loading={loading}
        loadingLabel={t("loadingMessages")}
        error={error || undefined}
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
                  disabled={updating === message.id || message.status === "read"}
                  onClick={() => void updateMessage(message, "read")}
                >
                  {t("markRead")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  disabled={updating === message.id || message.status === "replied"}
                  onClick={() => void updateMessage(message, "replied")}
                >
                  {t("markReplied")}
                </button>
              </div>
            ),
          },
        ]}
      />

      {!loading && messages.total > 0 && (
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
