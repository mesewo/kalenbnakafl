"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, type EventItem } from "@/lib/api";
import { formatDate } from "@/lib/api";
import MediaPicker from "@/components/MediaPicker";
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
  const displayLocale = useLocale();
  const tDashboard = useTranslations("dashboard");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [eventDate, setEventDate] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [coverMediaID, setCoverMediaID] = useState<number | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setDraft({
      en: event?.translations?.en ?? emptyDraft.en,
      am: event?.translations?.am ?? emptyDraft.am,
    });
    setEventDate(event?.event_date ? new Date(event.event_date).toISOString().slice(0, 16) : "");
    setEndsAt(event?.ends_at ? new Date(event.ends_at).toISOString().slice(0, 16) : "");
    setCoverMediaID(event?.cover_media_id ?? null);
    setMediaPickerOpen(false);
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
          tDashboard("translationIncomplete", {
            language: language === "en" ? tDashboard("english") : tDashboard("amharic"),
          }),
        );
        return null;
      }
      result[language] = { title, description, location };
    }
    if (!Object.keys(result).length) {
      setError(tDashboard("translationRequired"));
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
      setError(tDashboard("eventDateRequired"));
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
          ...(coverMediaID !== null ? { cover_media_id: coverMediaID } : {}),
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
        const coverChanged = (event.cover_media_id ?? null) !== coverMediaID;
        if (!operations.length || coverChanged) {
          const language = original.en ? "en" : "am";
          if (!operations.length) operations.push({ language, value: original[language] ?? null });
        }
        operations.sort((a, b) => Number(a.value === null) - Number(b.value === null));
        for (const [index, operation] of operations.entries()) {
          const translations: UpdateEventRequest["translations"] = {
            [operation.language]: operation.value,
          };
          const body: UpdateEventRequest = {
            translations,
            event_date: start,
            ends_at: end,
            ...(index === 0 && coverMediaID !== null ? { cover_media_id: coverMediaID } : {}),
            ...(index === 0 && coverMediaID === null && event.cover_media_id
              ? { clear_cover_media: true }
              : {}),
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
      setError(err instanceof Error ? err.message : tDashboard("saveEventFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
        <div className="modal-head">
          <h2 id="event-modal-title">
            {event ? tDashboard("editEvent") : tDashboard("createEvent")}
          </h2>
          <button
            className="close-btn"
            ref={closeRef}
            type="button"
            aria-label={tDashboard("closeDialog")}
            onClick={onClose}
          />
        </div>
        {error && (
          <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <div role="tablist" aria-label={tDashboard("eventLanguage")}>
            <button
              type="button"
              role="tab"
              aria-selected={locale === "en"}
              onClick={() => setLocale("en")}
            >
              {tDashboard("english")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={locale === "am"}
              onClick={() => setLocale("am")}
            >
              {tDashboard("amharic")}
            </button>
          </div>
          <div className="field">
            <label htmlFor="event-title">
              {tDashboard("title")} {"("}
              {locale === "en" ? tDashboard("english") : tDashboard("amharic")}
              {")"}
            </label>
            <input
              id="event-title"
              value={draft[locale].title}
              maxLength={180}
              onChange={(e) => change("title", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="event-description">
              {tDashboard("description")} {"("}
              {locale === "en" ? tDashboard("english") : tDashboard("amharic")}
              {")"}
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
              {tDashboard("location")} {"("}
              {locale === "en" ? tDashboard("english") : tDashboard("amharic")}
              {")"}
            </label>
            <input
              id="event-location"
              value={draft[locale].location}
              maxLength={500}
              onChange={(e) => change("location", e.target.value)}
            />
          </div>
          <div className="field">
            <p className="field-label">{tDashboard("eventCover")}</p>
            {coverMediaID !== null ? (
              <div className="cover-preview">
                <Image
                  src={`/api/staff/media/${coverMediaID}/file?w=960`}
                  alt=""
                  width={960}
                  height={540}
                  sizes="(max-width: 560px) 100vw, 520px"
                  unoptimized
                />
                <button
                  className="btn btn-outline btn-small"
                  type="button"
                  onClick={() => setCoverMediaID(null)}
                >
                  {tDashboard("removeCover")}
                </button>
              </div>
            ) : (
              <div className="cover-placeholder" aria-hidden="true" />
            )}
            <p className="meta">{tDashboard("eventCoverHint")}</p>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => setMediaPickerOpen(true)}
            >
              {coverMediaID === null ? tDashboard("selectCover") : tDashboard("changeCover")}
            </button>
          </div>
          <div className="field">
            <label htmlFor="event-date">{tDashboard("dateAndTime")}</label>
            <input
              id="event-date"
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
            {displayLocale === "am" && eventDate && (
              <small>
                {tDashboard("ethiopianDate", { date: formatDate(eventDate, true, displayLocale) })}
              </small>
            )}
          </div>
          <div className="field">
            <label htmlFor="event-ends-at">{tDashboard("endDateOptional")}</label>
            <input
              id="event-ends-at"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
            {displayLocale === "am" && endsAt && (
              <small>
                {tDashboard("ethiopianDate", { date: formatDate(endsAt, true, displayLocale) })}
              </small>
            )}
          </div>
          <p className="meta">{tDashboard("clearTranslationHelp")}</p>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={loading}>
              {loading
                ? tDashboard("saving")
                : event
                  ? tDashboard("saveChanges")
                  : tDashboard("createEvent")}
            </button>
            <button className="btn btn-outline" type="button" onClick={onClose}>
              {tDashboard("cancel")}
            </button>
          </div>
        </form>
      </div>
      <MediaPicker
        isOpen={mediaPickerOpen}
        selectedMediaID={coverMediaID}
        slotHint={tDashboard("eventCoverHint")}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(mediaID) => {
          setCoverMediaID(mediaID);
          setMediaPickerOpen(false);
        }}
      />
    </div>
  );
}
