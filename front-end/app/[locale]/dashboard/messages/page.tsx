"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatDate, type PageResponse } from "@/lib/api";

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
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">{t("messagesEyebrow")}</span>
          <h1>{t("inbox")}</h1>
        </div>
        <div className="field">
          <label htmlFor="message-status">{t("filterStatus")}</label>
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
        </div>
      </div>

      {error && (
        <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty-state" role="status">
          {t("loadingMessages")}
        </div>
      ) : messages.items.length === 0 ? (
        <div className="empty-state">{t("noMessages")}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("from")}</th>
                <th>{t("receivedLabel")}</th>
                <th>{t("status")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {messages.items.map((message) => {
                const isExpanded = expanded === message.id;
                return (
                  <tr key={message.id}>
                    <td>
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
                        <div
                          className="card"
                          style={{ marginTop: ".75rem", whiteSpace: "pre-wrap" }}
                        >
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
                    </td>
                    <td>{formatDate(message.created_at, true, locale)}</td>
                    <td>
                      <span className="badge">{statusLabels[message.status]}</span>
                    </td>
                    <td>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && messages.total > 0 && (
        <div className="form-actions" aria-label={t("messagePages")} style={{ marginTop: "1rem" }}>
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
