"use client";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { useConfirm, useToast } from "@/components/DashboardProviders";
import { apiFetch, formatDate, type EventItem, type MediaItem, type PageResponse } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
type Attendee = { name: string; email: string; created_at: string };
import EventModal from "@/components/EventModal";
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";

type EventsQueryData = { events: EventItem[]; mediaByID: Record<number, MediaItem> };

export default function EventsAdminPage() {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const confirm = useConfirm();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
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
  const eventsQuery = useQuery({
    queryKey: queryKeys.events,
    enabled: Boolean(user),
    queryFn: async (): Promise<EventsQueryData> => {
      const [eventPage, mediaPage] = await Promise.all([
        apiFetch<PageResponse<EventItem>>("/staff/events?limit=50", {}),
        apiFetch<PageResponse<MediaItem>>("/staff/media?kind=image&limit=100", {}),
      ]);
      return {
        events: eventPage.items ?? [],
        mediaByID: Object.fromEntries(mediaPage.items.map((item) => [item.id, item])),
      };
    },
  });
  const events = eventsQuery.data?.events ?? [];
  const mediaByID = eventsQuery.data?.mediaByID ?? {};
  const deleteMutation = useMutation({
    mutationFn: (event: EventItem) => apiFetch(`/staff/events/${event.id}`, { method: "DELETE" }),
    onMutate: async (event) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.events });
      const previous = queryClient.getQueryData<EventsQueryData>(queryKeys.events);
      queryClient.setQueryData<EventsQueryData>(queryKeys.events, (current) =>
        current
          ? { ...current, events: current.events.filter((item) => item.id !== event.id) }
          : current,
      );
      return { previous };
    },
    onError: (cause, _event, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.events, context.previous);
      const message = cause instanceof Error ? cause.message : t("deleteEventFailed");
      setError(message);
      showToast(message, "error");
    },
    onSuccess: () => {
      setError("");
      showToast(t("eventDeleted"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.events }),
  });

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
  function renderCover(mediaID?: number) {
    if (!mediaID)
      return <div className="dashboard-cover-thumb cover-placeholder" aria-hidden="true" />;
    const cover = mediaByID[mediaID];
    return (
      <div className="dashboard-cover-thumb">
        <Image
          src={`/api/staff/media/${mediaID}/file?w=480`}
          alt={cover?.decorative ? "" : (cover?.alt_text ?? "")}
          width={cover?.width || 480}
          height={cover?.height || 270}
          loading="lazy"
          unoptimized
        />
      </div>
    );
  }
  async function remove(event: EventItem) {
    if (!(await confirm(t("confirmDeleteEvent", { title: event.title }), t("delete")))) return;
    setError("");
    await deleteMutation.mutateAsync(event).catch(() => undefined);
  }
  return (
    <div>
      <PageHeader
        eyebrow={t("eventsEyebrow")}
        title={t("events")}
        action={
          <button className="btn btn-primary" onClick={() => setModal({ open: true, event: null })}>
            {t("newEvent")}
          </button>
        }
      />
      <DataTable
        rows={events}
        rowKey={(event) => event.id}
        loading={eventsQuery.isPending}
        loadingLabel={t("loadingEvents")}
        error={
          error ||
          (eventsQuery.isError
            ? eventsQuery.error instanceof Error
              ? eventsQuery.error.message
              : t("loadEventsFailed")
            : undefined)
        }
        emptyState={t("noEvents")}
        searchable
        searchPlaceholder={t("searchEvents")}
        columns={[
          {
            id: "event",
            label: t("event"),
            header: t("event"),
            cell: (event) => (
              <>
                {renderCover(event.cover_media_id)}
                <strong>{event.title}</strong>
                {(!event.translations?.am?.title || !event.translations?.am?.description) && (
                  <span className="badge status-pending">{t("missingAmharic")}</span>
                )}
                {(!event.translations?.en?.title || !event.translations?.en?.description) && (
                  <span className="badge status-pending">{t("missingEnglish")}</span>
                )}
                <div>
                  <Link href="/events" locale={locale === "en" ? "am" : "en"} className="meta">
                    {t("previewOtherLanguage")}
                  </Link>
                </div>
                <div className="meta">
                  {event.description.slice(0, 120)}
                  {event.description.length > 120 ? "..." : ""}
                </div>
              </>
            ),
            searchText: (event) => `${event.title} ${event.description}`,
            sortValue: (event) => event.title,
          },
          {
            id: "date",
            label: t("date"),
            header: t("date"),
            cell: (event) => formatDate(event.event_date, true, locale),
            sortValue: (event) => event.event_date,
          },
          {
            id: "actions",
            label: t("actions"),
            header: t("actions"),
            cell: (event) => (
              <>
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
                {attendeeEvent === event.id && user?.role === "admin" && (
                  <section className="card event-attendees">
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
                            <br />
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
                  </section>
                )}
              </>
            ),
          },
        ]}
      />
      <EventModal
        isOpen={modal.open}
        event={modal.event}
        onClose={() => setModal({ open: false, event: null })}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.events });
          showToast(t("contentSaved"));
        }}
        userRole={user?.role}
      />
    </div>
  );
}
