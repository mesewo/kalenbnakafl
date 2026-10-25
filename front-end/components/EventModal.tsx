"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, type EventItem } from "@/lib/api";
import type { components } from "@/types/api.d.ts";

type Locale = "en" | "am";
type Translation = components["schemas"]["EventTranslation"];
type CreateEventRequest = components["schemas"]["CreateEventRequest"];
type UpdateEventRequest = components["schemas"]["UpdateEventRequest"];
type Draft = Record<Locale, Translation>;
const emptyDraft: Draft = {
  en: { title: "", description: "", location: "" },
  am: { title: "", description: "", location: "" },
};

export default function EventModal({
  isOpen,
  onClose,
  onSuccess,
  event,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userRole: string | undefined;
  event?: EventItem | null;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [eventDate, setEventDate] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setDraft({
      en: event?.translations?.en ?? emptyDraft.en,
      am: event?.translations?.am ?? emptyDraft.am,
    });
    setEventDate(event?.event_date ? new Date(event.event_date).toISOString().slice(0, 16) : "");
    setEndsAt(event?.ends_at ? new Date(event.ends_at).toISOString().slice(0, 16) : "");
    setLocale("en");
    setError("");
  }, [event, isOpen]);
  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);
  if (!isOpen) return null;

  function change(field: keyof Translation, value: string) {
    setDraft((current) => ({ ...current, [locale]: { ...current[locale], [field]: value } }));
  }

  function translationsToSave(): Partial<Record<Locale, Translation>> | null {
    const result: Partial<Record<Locale, Translation>> = {};
    for (const language of ["en", "am"] as const) {
      const value = draft[language];
      const title = value.title.trim();
      const description = value.description.trim();
      const location = value.location.trim();
      if (!title && !description && !location) continue;
      if (!title || !description) {
        setError(
          `Complete title and description for ${language === "en" ? "English" : "አማርኛ"}, or clear all fields.`,
        );
        return null;
      }
      result[language] = { title, description, location };
    }
    if (!Object.keys(result).length) {
      setError("At least one complete language is required.");
      return null;
    }
    return result;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const values = translationsToSave();
    if (!values) return;
    if (!eventDate) {
      setError("An event date is required.");
      return;
    }
    const start = new Date(eventDate).toISOString();
    const end = endsAt ? new Date(endsAt).toISOString() : "";
    setLoading(true);
    try {
      if (!event) {
        const body: CreateEventRequest = {
          translations: values,
          event_date: start,
          ...(end ? { ends_at: end } : {}),
        };
        await apiFetch("/staff/events", { method: "POST", body: JSON.stringify(body) });
      } else {
        const original = event.translations ?? {};
        const operations: { language: Locale; value: Translation | null }[] = [];
        for (const language of ["en", "am"] as const) {
          const next = values[language] ?? null;
          const previous = original[language];
          if (JSON.stringify(next) !== JSON.stringify(previous ?? null))
            operations.push({ language, value: next });
        }
        if (!operations.length) {
          const language = original.en ? "en" : "am";
          operations.push({ language, value: original[language] ?? null });
        }
        operations.sort((a, b) => Number(a.value === null) - Number(b.value === null));
        for (const operation of operations) {
          const translations: UpdateEventRequest["translations"] = {
            [operation.language]: operation.value,
          };
          const body: UpdateEventRequest = {
            translations,
            event_date: start,
            ends_at: end,
          };
          await apiFetch(`/staff/events/${event.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        }
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the event.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
        <div className="modal-head">
          <h2 id="event-modal-title">{event ? "Edit event" : "Create an event"}</h2>
          <button
            className="close-btn"
            ref={closeRef}
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {error && (
          <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <div role="tablist" aria-label="Event language">
            <button
              type="button"
              role="tab"
              aria-selected={locale === "en"}
              onClick={() => setLocale("en")}
            >
              English
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={locale === "am"}
              onClick={() => setLocale("am")}
            >
              አማርኛ
            </button>
          </div>
          <div className="field">
            <label htmlFor="event-title">Title ({locale === "en" ? "English" : "አማርኛ"})</label>
            <input
              id="event-title"
              value={draft[locale].title}
              maxLength={180}
              onChange={(e) => change("title", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="event-description">
              Description ({locale === "en" ? "English" : "አማርኛ"})
            </label>
            <textarea
              id="event-description"
              value={draft[locale].description}
              maxLength={20000}
              onChange={(e) => change("description", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="event-location">
              Location ({locale === "en" ? "English" : "አማርኛ"})
            </label>
            <input
              id="event-location"
              value={draft[locale].location}
              maxLength={500}
              onChange={(e) => change("location", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="event-date">Date and time</label>
            <input
              id="event-date"
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="event-ends-at">End date and time (optional)</label>
            <input
              id="event-ends-at"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
          <p className="meta">
            Clear all translation fields for a language to remove it. At least one language must
            remain.
          </p>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "Saving…" : event ? "Save changes" : "Create event"}
            </button>
            <button className="btn btn-outline" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
