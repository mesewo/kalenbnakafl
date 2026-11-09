"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type User } from "@/lib/api";
import { useToast } from "@/components/DashboardProviders";
import { queryKeys } from "@/lib/query-keys";
import PageHeader from "@/components/ui/PageHeader";
import FormDialog from "@/components/ui/FormDialog";
import SubmitButton from "@/components/ui/SubmitButton";
import StatusBadge from "@/components/ui/StatusBadge";
import SkeletonCards from "@/components/ui/SkeletonCards";
import { useOptimisticMutation } from "@/lib/use-optimistic-mutation";
type Volunteer = User & {
  total_hours?: number;
  contributions?: { id: number; hours: number; notes: string; contribution_date: string }[];
};
export default function VolunteersPage() {
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  const showToast = useToast();
  const [selected, setSelected] = useState<Volunteer | null>(null);
  const [form, setForm] = useState({
    hours: "",
    notes: "",
    contribution_date: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");
  const [formDirty, setFormDirty] = useState(false);
  const volunteersQuery = useQuery({
    queryKey: queryKeys.volunteers,
    enabled: Boolean(user),
    queryFn: () => apiFetch<Volunteer[]>("/admin/volunteers", {}),
  });
  const volunteers = volunteersQuery.data ?? [];
  const contributionMutation = useOptimisticMutation<
    Volunteer[],
    { volunteer: Volunteer; hours: number; notes: string; date: string }
  >({
    queryKey: queryKeys.volunteers,
    mutationFn: ({
      volunteer,
      hours,
      notes,
      date,
    }: {
      volunteer: Volunteer;
      hours: number;
      notes: string;
      date: string;
    }) =>
      apiFetch(`/admin/volunteers/${volunteer.id}/contributions`, {
        method: "POST",
        body: JSON.stringify({
          hours,
          notes,
          contribution_date: date,
        }),
      }),
    optimisticUpdate: (current, { volunteer, hours }) =>
      current.map((item) =>
        item.id === volunteer.id ? { ...item, total_hours: (item.total_hours ?? 0) + hours } : item,
      ),
    onError: (cause) => {
      const message = cause instanceof Error ? cause.message : t("recordContributionFailed");
      setError(message);
      showToast(message, "error");
    },
    onSuccess: () => {
      setError("");
      showToast(t("contributionSaved"));
      setForm({ hours: "", notes: "", contribution_date: new Date().toISOString().slice(0, 10) });
      setFormDirty(false);
      setSelected(null);
    },
  });
  function addContribution(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError("");
    void contributionMutation.mutate({
      volunteer: selected,
      hours: Number(form.hours),
      notes: form.notes,
      date: form.contribution_date,
    });
  }
  return (
    <div>
      <PageHeader eyebrow={t("volunteersEyebrow")} title={t("volunteers")} />
      {(error || (volunteersQuery.isError && volunteersQuery.error instanceof Error)) && (
        <div className="status status-error dashboard-status" role="alert">
          {error ||
            (volunteersQuery.error instanceof Error
              ? volunteersQuery.error.message
              : t("loadVolunteersFailed"))}
        </div>
      )}
      {volunteersQuery.isPending ? (
        <SkeletonCards label={t("loadingVolunteers")} />
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
              <SubmitButton pending={contributionMutation.isPending} pendingLabel={t("saving")}>
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
