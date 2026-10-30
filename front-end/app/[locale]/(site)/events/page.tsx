import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import EventSignup from "@/components/EventSignup";
import { fetchPublic } from "@/lib/server-api";
import { formatDate, type EventItem, type PageResponse } from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";
import PublicMediaImage from "@/components/PublicMediaImage";

export const revalidate = 60;
type Props = { params: Promise<{ locale: "en" | "am" }>; searchParams: Promise<{ page?: string }> };
export async function generateMetadata({ params }: Pick<Props, "params">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return localizedMetadata(locale, "/events", `${t("events")} | Kalen Benakafil`, t("events"));
}
export default async function EventsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const q = await searchParams;
  const page = Math.max(1, Number(q.page) || 1);
  const t = await getTranslations("events");
  const common = await getTranslations("common");
  const result = await fetchPublic<PageResponse<EventItem>>(
    `/events?upcoming=true&page=${page}&limit=10`,
    locale,
  );
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.limit || 10)));
  return (
    <main id="main-content">
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">{t("eyebrow")}</span>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          {!result ? (
            <div className="status status-error" role="alert">
              {common("error")}
            </div>
          ) : result.items.length === 0 ? (
            <div className="empty-state">
              {t("empty")} <Link href="/contact">{t("ask")}</Link>
            </div>
          ) : (
            <div className="grid-2">
              {result.items.map((event) => (
                <article className="card" key={event.id}>
                  <PublicMediaImage
                    mediaID={event.cover_media_id}
                    locale={locale}
                    className="public-media-card"
                  />
                  <span className="eyebrow">{formatDate(event.event_date, true, locale)}</span>
                  <h2>
                    <Link href={`/events/${event.id}`}>{event.title}</Link>
                  </h2>
                  {event.fallback && <small>{common("fallback")}</small>}
                  <p>{event.description}</p>
                  {event.location && <p className="meta">{event.location}</p>}
                  <Link className="meta" href={`/events/${event.id}`}>
                    {t("details")}
                  </Link>
                  <EventSignup event={event} />
                </article>
              ))}
            </div>
          )}
          <nav
            className="form-actions"
            aria-label={t("pages")}
            style={{ justifyContent: "space-between", marginTop: "1.5rem" }}
          >
            <Link
              className="btn btn-outline"
              aria-disabled={page <= 1}
              href={`/events?page=${Math.max(1, page - 1)}`}
            >
              {t("previous")}
            </Link>
            <span className="meta">{t("page", { page, total: pages })}</span>
            <Link
              className="btn btn-outline"
              aria-disabled={page >= pages}
              href={`/events?page=${Math.min(pages, page + 1)}`}
            >
              {t("next")}
            </Link>
          </nav>
        </div>
      </section>
    </main>
  );
}
