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
      setError(err instanceof Error ? err.message : "Could not load contact messages.");
    } finally {
      setLoading(false);
    }
  }, [isStaff, page, status]);

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
      setError(err instanceof Error ? err.message : "Could not update this message.");
    } finally {
      setUpdating(null);
    }
  }

  if (authLoading) return <div className="empty-state">Checking your access…</div>;
  if (!isStaff)
    return <div className="empty-state">You do not have permission to view messages.</div>;

  return (
    <div>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">Community messages</span>
          <h1>Contact inbox</h1>
        </div>
        <div className="field">
          <label htmlFor="message-status">Filter by status</label>
          <select
            id="message-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter);
              setPage(1);
            }}
          >
            <option value="">All messages</option>
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="replied">Replied</option>
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
          Loading messages…
        </div>
      ) : messages.items.length === 0 ? (
        <div className="empty-state">No contact messages match this filter.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>From</th>
                <th>{t("receivedLabel")}</th>
                <th>Status</th>
                <th>Actions</th>
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
                        {isExpanded ? "Hide message" : message.name}
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
                              Handled by {message.handled_by_name}
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
                      <span className="badge">{message.status}</span>
                    </td>
                    <td>
                      <div className="form-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-small"
                          disabled={updating === message.id || message.status === "read"}
                          onClick={() => void updateMessage(message, "read")}
                        >
                          Mark read
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-small"
                          disabled={updating === message.id || message.status === "replied"}
                          onClick={() => void updateMessage(message, "replied")}
                        >
                          Mark replied
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
        <div
          className="form-actions"
          aria-label="Contact message pages"
          style={{ marginTop: "1rem" }}
        >
          <button
            type="button"
            className="btn btn-outline btn-small"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="meta">
            Page {messages.page} · {messages.total} messages
          </span>
          <button
            type="button"
            className="btn btn-outline btn-small"
            disabled={page * messages.limit >= messages.total}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
