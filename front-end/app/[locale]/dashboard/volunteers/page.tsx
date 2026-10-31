"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type User } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import FormDialog from "@/components/ui/FormDialog";
import SubmitButton from "@/components/ui/SubmitButton";
import StatusBadge from "@/components/ui/StatusBadge";
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
  const [formDirty, setFormDirty] = useState(false);
  const [savingContribution, setSavingContribution] = useState(false);
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
    setError("");
    setSavingContribution(true);
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
      setFormDirty(false);
      setSelected(null);
      setError("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("recordContributionFailed"));
    } finally {
      setSavingContribution(false);
    }
  }
  return (
    <div>
      <PageHeader eyebrow={t("volunteersEyebrow")} title={t("volunteers")} />
      {error && (
        <div className="status status-error dashboard-status" role="alert">
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
              <StatusBadge>{t("roleVolunteer")}</StatusBadge>
              <h2>{item.name}</h2>
              <p>{item.email}</p>
              <p>{t("recordedHourCount", { count: item.total_hours || 0 })}</p>
              <button
                className="btn btn-sun btn-small"
                onClick={() => {
                  setSelected(item);
                  setFormDirty(false);
                  setForm({
                    hours: "",
                    notes: "",
                    contribution_date: new Date().toISOString().slice(0, 10),
                  });
                }}
              >
                {t("recordContribution")}
              </button>
            </article>
          ))}
        </div>
      )}
      <FormDialog
        open={selected !== null}
        title={selected ? t("recordTimeFor", { name: selected.name }) : ""}
        onClose={() => {
          setSelected(null);
          setFormDirty(false);
          setForm({
            hours: "",
            notes: "",
            contribution_date: new Date().toISOString().slice(0, 10),
          });
        }}
        dirty={formDirty}
        discardTitle={t("confirmActionTitle")}
        discardMessage={t("discardFormChanges")}
        discardLabel={t("discardChanges")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
      >
        {(requestClose) => (
          <form onSubmit={addContribution}>
            <div className="field">
              <label htmlFor="contribution-hours">{t("hours")}</label>
              <input
                id="contribution-hours"
                type="number"
                min="0.25"
                step="0.25"
                value={form.hours}
                onChange={(e) => {
                  setForm({ ...form, hours: e.target.value });
                  setFormDirty(true);
                }}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="contribution-date">{t("date")}</label>
              <input
                id="contribution-date"
                type="date"
                value={form.contribution_date}
                onChange={(e) => {
                  setForm({ ...form, contribution_date: e.target.value });
                  setFormDirty(true);
                }}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="contribution-notes">{t("notes")}</label>
              <textarea
                id="contribution-notes"
                value={form.notes}
                onChange={(e) => {
                  setForm({ ...form, notes: e.target.value });
                  setFormDirty(true);
                }}
              />
            </div>
            {error && (
              <div className="status status-error dashboard-status" role="alert">
                {error}
              </div>
            )}
            <div className="form-actions">
              <SubmitButton pending={savingContribution} pendingLabel={t("saving")}>
                {t("saveContribution")}
              </SubmitButton>
              <button type="button" className="btn btn-outline" onClick={requestClose}>
                {t("cancel")}
              </button>
            </div>
          </form>
        )}
      </FormDialog>
    </div>
  );
}
