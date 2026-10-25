"use client";
import { Fragment, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatDate, type EventItem, type PageResponse } from "@/lib/api";
type Attendee = { name: string; email: string; created_at: string };
import EventModal from "@/components/EventModal";
export default function EventsAdminPage() {
  const locale = useLocale();
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
  async function load() {
    if (!user) return;
    setLoading(true);
    try {
      setEvents(
        (await (await apiFetch<PageResponse<EventItem>>(`${prefix}/events?limit=50`, {})).items) ||
          [],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load events.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [user, user?.role]);

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
      setAttendeeError(err instanceof Error ? err.message : "Could not load attendees.");
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
    if (!window.confirm(`Delete “${event.title}”?`)) return;
    try {
      await apiFetch(`${prefix}/events/${event.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the event.");
    }
  }
  return (
    <div>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">Gatherings</span>
          <h1>Events</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ open: true, event: null })}>
          New event
        </button>
      </div>
      {error && (
        <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-state">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="empty-state">No events yet. Add the next gathering.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <Fragment key={event.id}>
                  <tr>
                    <td>
                      <strong>{event.title}</strong>
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
                          Edit
                        </button>
                        <button className="btn btn-danger btn-small" onClick={() => remove(event)}>
                          Delete
                        </button>
                        {user?.role === "admin" && (
                          <button
                            className="btn btn-outline btn-small"
                            onClick={() => toggleAttendees(event.id)}
                          >
                            Attendees
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {attendeeEvent === event.id && user?.role === "admin" && (
                    <tr>
                      <td colSpan={3}>
                        <h3>Attendees for {event.title}</h3>
                        {attendeeError && (
                          <div className="status status-error" role="alert">
                            {attendeeError}
                          </div>
                        )}
                        {attendeeLoading ? (
                          <div className="empty-state" role="status">
                            Loading attendees...
                          </div>
                        ) : attendees.items.length === 0 ? (
                          <div className="empty-state">No one has signed up yet.</div>
                        ) : (
                          <ul>
                            {attendees.items.map((attendee) => (
                              <li key={attendee.email}>
                                {attendee.name} - {attendee.email}
                              </li>
                            ))}
                          </ul>
                        )}
                        <nav className="form-actions" aria-label="Attendee pages">
                          <button
                            className="btn btn-outline btn-small"
                            disabled={attendees.page <= 1 || attendeeLoading}
                            onClick={() => void loadAttendees(event.id, attendees.page - 1)}
                          >
                            Previous
                          </button>
                          <span className="meta">
                            Page {attendees.page} of{" "}
                            {Math.max(1, Math.ceil(attendees.total / attendees.limit))}
                          </span>
                          <button
                            className="btn btn-outline btn-small"
                            disabled={
                              attendees.page * attendees.limit >= attendees.total || attendeeLoading
                            }
                            onClick={() => void loadAttendees(event.id, attendees.page + 1)}
                          >
                            Next
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
