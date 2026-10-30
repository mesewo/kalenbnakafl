import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import EventSignup from "@/components/EventSignup";
import PublicMediaImage from "@/components/PublicMediaImage";
import { Link } from "@/i18n/navigation";
import { formatDate, type EventItem } from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";
import { fetchPublic, PublicApiError } from "@/lib/server-api";

export const revalidate = 60;

type Props = { params: Promise<{ locale: "en" | "am"; id: string }> };

async function getEvent(id: string, locale: "en" | "am"): Promise<EventItem | null> {
  try {
    return await fetchPublic<EventItem>(`/events/${encodeURIComponent(id)}`, locale);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const event = await getEvent(id, locale);
  const t = await getTranslations({ locale, namespace: "events" });
  if (!event) return localizedMetadata(locale, `/events/${id}`, t("notFound"), t("notFound"));
  return localizedMetadata(
    locale,
    `/events/${id}`,
    `${event.title} | Kalen Benakafil`,
    event.description.slice(0, 160),
  );
}

export default async function EventDetailPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const event = await getEvent(id, locale);
  if (!event) notFound();
  const t = await getTranslations("events");
  const common = await getTranslations("common");

  return (
    <main id="main-content">
      <section className="page-hero">
        <div className="container">
          <Link className="eyebrow" href="/events">
            {t("back")}
          </Link>
          <p className="eyebrow">{formatDate(event.event_date, true, locale)}</p>
          <h1>{event.title}</h1>
          {event.fallback && <p className="meta">{common("fallback")}</p>}
        </div>
      </section>
      <article className="section">
        <div className="container event-detail">
          <PublicMediaImage
            mediaID={event.cover_media_id}
            locale={locale}
            className="public-media-cover"
          />
          <div className="lede" style={{ whiteSpace: "pre-wrap" }}>
            <p>{event.description}</p>
            {event.location && <p className="meta">{event.location}</p>}
            <EventSignup event={event} />
          </div>
        </div>
      </article>
    </main>
  );
}
