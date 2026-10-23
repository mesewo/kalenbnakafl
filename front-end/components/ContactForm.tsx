"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
export default function ContactForm() {
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
      setStatus({
        type: "success",
        message: "Your message is on its way. We will get back to you soon.",
      });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "We could not send your message.",
      });
    } finally {
      setLoading(false);
    }
  }
  return (
    <form onSubmit={handleSubmit} className="form-card" noValidate>
      <div className="section-head" style={{ marginBottom: "1.5rem" }}>
        <div>
          <span className="eyebrow">Say hello</span>
          <h2>Start a conversation.</h2>
        </div>
      </div>
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
        <label htmlFor="contact-name">Your name</label>
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
        <label htmlFor="contact-email">Email address</label>
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
        <label htmlFor="contact-message">How can we help?</label>
        <textarea
          id="contact-message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          required
          aria-describedby="message-help"
        />
        <small id="message-help">
          Questions, ideas, partnership notes, or volunteer interest are all welcome.
        </small>
      </div>
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
