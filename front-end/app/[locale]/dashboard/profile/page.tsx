"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Field from "@/components/ui/Field";
import SubmitButton from "@/components/ui/SubmitButton";
import StatusBadge from "@/components/ui/StatusBadge";

export default function ProfilePage() {
  const { user } = useAuth();
  const t = useTranslations("dashboard");
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password && password !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/profile", {
        method: "PUT",
        body: JSON.stringify({ name, email, ...(password ? { password } : {}) }),
      });
      setMessage(t("profileUpdated"));
      setPassword("");
      setConfirm("");
    } catch {
      setError(t("profileUpdateFailed"));
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
      <div className="profile-form-shell">
        <form className="form-card" onSubmit={submit}>
          <Field id="profile-name" label={t("name")}>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field id="profile-email" label={t("email")}>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <hr className="profile-divider" />
          <Field id="profile-password" label={t("newPassword")} hint={t("passwordHint")}>
            <input
              id="profile-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field id="profile-confirm" label={t("confirmPassword")}>
            <input
              id="profile-confirm"
              type="password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {message && (
            <div className="status status-success dashboard-status" role="status">
              {message}
            </div>
          )}
          {error && (
            <div className="status status-error dashboard-status" role="alert">
              {error}
            </div>
          )}
          <SubmitButton pending={loading} pendingLabel={t("saving")}>
            {t("saveProfile")}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
