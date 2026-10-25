"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type PageResponse } from "@/lib/api";

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
      setError(err instanceof Error ? err.message : "Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, [user, status, page]);
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
      setError(err instanceof Error ? err.message : "Could not review application.");
    } finally {
      setBusy(null);
    }
  }
  if (user?.role !== "admin")
    return (
      <div className="status status-error" role="alert">
        Administrator access is required.
      </div>
    );
  const pages = Math.max(1, Math.ceil(result.total / result.limit));
  return (
    <div>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">Community participation</span>
          <h1>Volunteer applications</h1>
        </div>
      </div>
      <div className="field">
        <label htmlFor="application-status">Filter by status</label>
        <select
          id="application-status"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="">All statuses</option>
        </select>
      </div>
      {error && (
        <div className="status status-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-state" role="status">
          Loading applications…
        </div>
      ) : result.items.length === 0 ? (
        <div className="empty-state">No applications match this status.</div>
      ) : (
        <div className="grid-2">
          {result.items.map((item) => (
            <article className="card" key={item.id}>
              <span className="badge">{item.status}</span>
              <h2>{item.name}</h2>
              <p>{item.email}</p>
              <h3>Skills and interests</h3>
              <p>{item.skills}</p>
              <h3>Availability</h3>
              <p>{item.availability}</p>
              {item.message && (
                <>
                  <h3>Message</h3>
                  <p>{item.message}</p>
                </>
              )}
              <p className="meta">Received {new Date(item.created_at).toLocaleDateString()}</p>
              {item.status === "pending" && (
                <div className="form-actions">
                  <button
                    className="btn btn-primary btn-small"
                    disabled={busy === item.id}
                    onClick={() => void review(item, "approved")}
                  >
                    {busy === item.id ? "Saving…" : "Approve"}
                  </button>
                  <button
                    className="btn btn-outline btn-small"
                    disabled={busy === item.id}
                    onClick={() => void review(item, "declined")}
                  >
                    Decline
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <nav
        className="form-actions"
        aria-label="Volunteer application pages"
        style={{ justifyContent: "space-between", marginTop: "1.5rem" }}
      >
        <button
          className="btn btn-outline"
          disabled={page <= 1 || loading}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          Previous
        </button>
        <span className="meta">
          Page {page} of {pages}
        </span>
        <button
          className="btn btn-outline"
          disabled={page >= pages || loading}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
