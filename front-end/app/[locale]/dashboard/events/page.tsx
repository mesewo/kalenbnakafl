"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatDate, type EventItem, type PageResponse } from "@/lib/api";
type Attendee = { name: string; email: string; created_at: string };
import EventModal from "@/components/EventModal";
export default function EventsAdminPage() {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attendeeEvent, setAttendeeEvent] = useState<number | null>(null);
  const [attendees, setAttendees] = useState<PageResponse<Attendee>>({
    items: [],
    page: 1,
    limit: 10,
    total: 0,
  });
  const [attendeeLoading, setAttendeeLoading] = useState(false);
  const [attendeeError, setAttendeeError] = useState("");
  const [modal, setModal] = useState<{ open: boolean; event: EventItem | null }>({
    open: false,
    event: null,
  });
  const prefix = "/staff";
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setEvents(
        (await (await apiFetch<PageResponse<EventItem>>(`${prefix}/events?limit=50`, {})).items) ||
          [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadEventsFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user]);
  useEffect(() => {
    void load();
  }, [load]);

  async function loadAttendees(eventID: number, requestedPage = 1) {
    setAttendeeLoading(true);
    setAttendeeError("");
    try {
      setAttendees(
        await apiFetch<PageResponse<Attendee>>(
          `/admin/events/${eventID}/signups?page=${requestedPage}&limit=10`,
          {},
        ),
      );
    } catch (err) {
      setAttendeeError(err instanceof Error ? err.message : t("loadAttendeesFailed"));
    } finally {
      setAttendeeLoading(false);
    }
  }
  function toggleAttendees(eventID: number) {
    if (attendeeEvent === eventID) {
      setAttendeeEvent(null);
      return;
    }
    setAttendeeEvent(eventID);
    void loadAttendees(eventID, 1);
  }
  async function remove(event: EventItem) {
    if (!window.confirm(t("confirmDeleteEvent", { title: event.title }))) return;
    try {
      await apiFetch(`${prefix}/events/${event.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deleteEventFailed"));
    }
  }
  return (
    <div>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">{t("eventsEyebrow")}</span>
          <h1>{t("events")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ open: true, event: null })}>
          {t("newEvent")}
        </button>
      </div>
      {error && (
        <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-state">{t("loadingEvents")}</div>
      ) : events.length === 0 ? (
        <div className="empty-state">{t("noEvents")}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("event")}</th>
                <th>{t("date")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <Fragment key={event.id}>
                  <tr>
                    <td>
                      <strong>{event.title}</strong>
                      {(!event.translations?.am?.title || !event.translations?.am?.description) && (
                        <span className="badge status-pending">{t("missingAmharic")}</span>
                      )}
                      {(!event.translations?.en?.title || !event.translations?.en?.description) && (
                        <span className="badge status-pending">{t("missingEnglish")}</span>
                      )}
                      <div>
                        <Link
                          href="/events"
                          locale={locale === "en" ? "am" : "en"}
                          className="meta"
                        >
                          {t("previewOtherLanguage")}
                        </Link>
                      </div>
                      <div className="meta">
                        {event.description.slice(0, 120)}
                        {event.description.length > 120 ? "..." : ""}
                      </div>
                    </td>
                    <td>{formatDate(event.event_date, true, locale)}</td>
                    <td>
                      <div className="form-actions">
                        <button
                          className="btn btn-outline btn-small"
                          onClick={() => setModal({ open: true, event })}
                        >
                          {t("edit")}
                        </button>
                        <button className="btn btn-danger btn-small" onClick={() => remove(event)}>
                          {t("delete")}
                        </button>
                        {user?.role === "admin" && (
                          <button
                            className="btn btn-outline btn-small"
                            onClick={() => toggleAttendees(event.id)}
                          >
                            {t("attendees")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {attendeeEvent === event.id && user?.role === "admin" && (
                    <tr>
                      <td colSpan={3}>
                        <h3>{t("attendeesFor", { title: event.title })}</h3>
                        {attendeeError && (
                          <div className="status status-error" role="alert">
                            {attendeeError}
                          </div>
                        )}
                        {attendeeLoading ? (
                          <div className="empty-state" role="status">
                            {t("loadingAttendees")}
                          </div>
                        ) : attendees.items.length === 0 ? (
                          <div className="empty-state">{t("noAttendees")}</div>
                        ) : (
                          <ul>
                            {attendees.items.map((attendee) => (
                              <li key={attendee.email}>
                                {attendee.name}
                                {" — "}
                                {attendee.email}
                              </li>
                            ))}
                          </ul>
                        )}
                        <nav className="form-actions" aria-label={t("attendeePages")}>
                          <button
                            className="btn btn-outline btn-small"
                            disabled={attendees.page <= 1 || attendeeLoading}
                            onClick={() => void loadAttendees(event.id, attendees.page - 1)}
                          >
                            {t("previous")}
                          </button>
                          <span className="meta">
                            {t("pageOf", {
                              page: attendees.page,
                              total: Math.max(1, Math.ceil(attendees.total / attendees.limit)),
                            })}
                          </span>
                          <button
                            className="btn btn-outline btn-small"
                            disabled={
                              attendees.page * attendees.limit >= attendees.total || attendeeLoading
                            }
                            onClick={() => void loadAttendees(event.id, attendees.page + 1)}
                          >
                            {t("next")}
                          </button>
                        </nav>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EventModal
        isOpen={modal.open}
        event={modal.event}
        onClose={() => setModal({ open: false, event: null })}
        onSuccess={load}
        userRole={user?.role}
      />
    </div>
  );
}
