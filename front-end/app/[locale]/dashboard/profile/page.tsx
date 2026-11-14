"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Field from "@/components/ui/Field";
import SubmitButton from "@/components/ui/SubmitButton";
import StatusBadge from "@/components/ui/StatusBadge";
import FormDialog from "@/components/ui/FormDialog";

type ProfileForm = { name: string; email: string; password: string; confirm: string };

export default function ProfilePage() {
  const { user } = useAuth();
  const t = useTranslations("dashboard");
  const [form, setForm] = useState<ProfileForm>({
    name: user?.name ?? "",
    email: user?.email ?? "",
    password: "",
    confirm: "",
  });
  const [initialForm, setInitialForm] = useState<ProfileForm>(form);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const next = { name: user.name, email: user.email, password: "", confirm: "" };
    setForm(next);
    setInitialForm(next);
  }, [user]);

  function closeForm() {
    setForm(initialForm);
    setFormOpen(false);
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    const passwordBytes = new TextEncoder().encode(form.password).length;
    if (form.password && (Array.from(form.password).length < 12 || passwordBytes > 72)) {
      setError(t("passwordHint"));
      return;
    }
    if (form.password && form.password !== form.confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/profile", {
        method: "PUT",
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          ...(form.password ? { password: form.password } : {}),
        }),
      });
      setMessage(t("profileUpdated"));
      const next = { ...form, password: "", confirm: "" };
      setForm(next);
      setInitialForm(next);
      setFormOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("profileUpdateFailed"));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div>
      <PageHeader
        eyebrow={t("yourDetails")}
        title={t("profile")}
        action={<StatusBadge>{user ? t(`roles.${user.role}`) : ""}</StatusBadge>}
      />
      {message && (
        <div className="status status-success dashboard-status" role="status">
          {message}
        </div>
      )}
      <div className="card">
        <dl>
          <dt>{t("name")}</dt>
          <dd>{user?.name}</dd>
          <dt>{t("email")}</dt>
          <dd>{user?.email}</dd>
        </dl>
      </div>
      <button className="btn btn-primary" type="button" onClick={() => setFormOpen(true)}>
        {t("edit")}
      </button>
      <FormDialog
        open={formOpen}
        title={t("profile")}
        onClose={closeForm}
        dirty={JSON.stringify(form) !== JSON.stringify(initialForm)}
        discardTitle={t("confirmActionTitle")}
        discardMessage={t("discardFormChanges")}
        discardLabel={t("discardChanges")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
      >
        {(requestClose) => (
          <form className="form-card" onSubmit={submit}>
            {error && (
              <div className="status status-error dashboard-status" role="alert">
                {error}
              </div>
            )}
            <Field id="profile-name" label={t("name")}>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </Field>
            <Field id="profile-email" label={t("email")}>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                required
              />
            </Field>
            <hr className="profile-divider" />
            <Field id="profile-password" label={t("newPassword")} hint={t("passwordHint")}>
              <input
                type="password"
                minLength={12}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </Field>
            <Field id="profile-confirm" label={t("confirmPassword")}>
              <input
                type="password"
                minLength={12}
                value={form.confirm}
                onChange={(event) => setForm({ ...form, confirm: event.target.value })}
              />
            </Field>
            <div className="form-actions">
              <SubmitButton pending={loading} pendingLabel={t("saving")}>
                {t("saveProfile")}
              </SubmitButton>
              <button
                type="button"
                className="btn btn-outline"
                onClick={requestClose}
                disabled={loading}
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        )}
      </FormDialog>
    </div>
  );
}
