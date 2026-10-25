"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

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
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">{t("yourDetails")}</span>
          <h1>{t("profile")}</h1>
        </div>
        <span className="badge">{user ? t(`roles.${user.role}`) : ""}</span>
      </div>
      <div className="form-shell" style={{ margin: 0 }}>
        <form className="form-card" onSubmit={submit}>
          <div className="field">
            <label htmlFor="profile-name">{t("name")}</label>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="profile-email">{t("email")}</label>
            <input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "1.5rem 0" }} />
          <div className="field">
            <label htmlFor="profile-password">{t("newPassword")}</label>
            <input
              id="profile-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>{t("passwordHint")}</small>
          </div>
          <div className="field">
            <label htmlFor="profile-confirm">{t("confirmPassword")}</label>
            <input
              id="profile-confirm"
              type="password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {message && (
            <div className="status status-success" role="status" style={{ marginBottom: "1rem" }}>
              {message}
            </div>
          )}
          {error && (
            <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary" disabled={loading}>
            {loading ? t("saving") : t("saveProfile")}
          </button>
        </form>
      </div>
    </div>
  );
}
