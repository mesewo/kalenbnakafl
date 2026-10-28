"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type User } from "@/lib/api";
type Volunteer = User & {
  total_hours?: number;
  contributions?: { id: number; hours: number; notes: string; contribution_date: string }[];
};
export default function VolunteersPage() {
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [selected, setSelected] = useState<Volunteer | null>(null);
  const [form, setForm] = useState({
    hours: "",
    notes: "",
    contribution_date: new Date().toISOString().slice(0, 10),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setVolunteers((await apiFetch<Volunteer[]>("/admin/volunteers", {})) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadVolunteersFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user]);
  useEffect(() => {
    void load();
  }, [load]);
  async function addContribution(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      await apiFetch(`/admin/volunteers/${selected.id}/contributions`, {
        method: "POST",
        body: JSON.stringify({
          hours: Number(form.hours),
          notes: form.notes,
          contribution_date: form.contribution_date,
        }),
      });
      setForm({ hours: "", notes: "", contribution_date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("recordContributionFailed"));
    }
  }
  return (
    <div>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">{t("volunteersEyebrow")}</span>
          <h1>{t("volunteers")}</h1>
        </div>
      </div>
      {error && (
        <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-state">{t("loadingVolunteers")}</div>
      ) : volunteers.length === 0 ? (
        <div className="empty-state">{t("noVolunteers")}</div>
      ) : (
        <div className="grid-2">
          {volunteers.map((item) => (
            <article className="card" key={item.id}>
              <span className="badge">{t("roleVolunteer")}</span>
              <h2>{item.name}</h2>
              <p>{item.email}</p>
              <p>{t("recordedHourCount", { count: item.total_hours || 0 })}</p>
              <button className="btn btn-sun btn-small" onClick={() => setSelected(item)}>
                {t("recordContribution")}
              </button>
            </article>
          ))}
        </div>
      )}
      {selected && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contribution-title"
          >
            <div className="modal-head">
              <h2 id="contribution-title">{t("recordTimeFor", { name: selected.name })}</h2>
              <button
                className="close-btn"
                onClick={() => setSelected(null)}
                aria-label={t("closeDialog")}
              />
            </div>
            <form onSubmit={addContribution}>
              <div className="field">
                <label htmlFor="contribution-hours">{t("hours")}</label>
                <input
                  id="contribution-hours"
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="contribution-date">{t("date")}</label>
                <input
                  id="contribution-date"
                  type="date"
                  value={form.contribution_date}
                  onChange={(e) => setForm({ ...form, contribution_date: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="contribution-notes">{t("notes")}</label>
                <textarea
                  id="contribution-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <button className="btn btn-primary">{t("saveContribution")}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
