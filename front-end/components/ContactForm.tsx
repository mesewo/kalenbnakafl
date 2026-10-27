"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useApiWakeup } from "@/lib/use-api-wakeup";

export default function ContactForm() {
  const t = useTranslations("contact");
  const common = useTranslations("common");
  const isWaking = useApiWakeup();
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await apiFetch("/contact", { method: "POST", body: JSON.stringify(formData) });
      setFormData({ name: "", email: "", message: "" });
      setStatus({ type: "success", message: t("success") });
    } catch (err) {
      setStatus({ type: "error", message: err instanceof Error ? err.message : t("failure") });
    } finally {
      setLoading(false);
    }
  }
  return (
    <form onSubmit={handleSubmit} className="form-card" noValidate>
      <div className="section-head" style={{ marginBottom: "1.5rem" }}>
        <div>
          <span className="eyebrow">{t("say")}</span>
          <h2>{t("formTitle")}</h2>
        </div>
      </div>
      {isWaking && (
        <div className="status" role="status" aria-live="polite" style={{ marginBottom: "1rem" }}>
          {common("serverWaking")}
        </div>
      )}
      {status && (
        <div
          className={`status status-${status.type}`}
          role={status.type === "error" ? "alert" : "status"}
          aria-live="polite"
          style={{ marginBottom: "1rem" }}
        >
          {status.message}
        </div>
      )}
      <div className="field">
        <label htmlFor="contact-name">{t("name")}</label>
        <input
          id="contact-name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          autoComplete="name"
        />
      </div>
      <div className="field">
        <label htmlFor="contact-email">{t("emailLabel")}</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
          autoComplete="email"
        />
      </div>
      <div className="field">
        <label htmlFor="contact-message">{t("message")}</label>
        <textarea
          id="contact-message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          required
          aria-describedby="message-help"
        />
        <small id="message-help">{t("help")}</small>
      </div>
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? t("sending") : t("send")}
      </button>
    </form>
  );
}
