import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { fetchPublic } from "@/lib/server-api";
import { formatDate, excerpt, type EventItem, type PageResponse, type Post } from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";

export const revalidate = 60;
type Props = { params: Promise<{ locale: "en" | "am" }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return localizedMetadata(locale, "/", t("title"), t("home"));
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const common = await getTranslations("common");
  const [posts, events] = await Promise.all([
    fetchPublic<PageResponse<Post>>("/posts?limit=2", locale),
    fetchPublic<PageResponse<EventItem>>("/events?upcoming=true&limit=2", locale),
  ]);
  return (
    <>
      <main id="main-content">
        <section className="hero">
          <div className="container hero-grid">
            <div>
              <span className="eyebrow">{t("eyebrow")}</span>
              <h1 className="display">{t("title")}</h1>
              <p className="lede">{t("intro")}</p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href="/volunteer">
                  {t("help")}
                </Link>
                <Link className="btn btn-outline" href="/events">
                  {t("upcoming")}
                </Link>
              </div>
            </div>
            <div className="hero-card">
              <span className="eyebrow" style={{ color: "var(--sun)" }}>
                {t("shared")}
              </span>
              <h2>{t("thrive")}</h2>
              <div className="hero-note">
                <strong>{t("one")}</strong>
                <span>{t("oneText")}</span>
              </div>
            </div>
          </div>
        </section>
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t("how")}</span>
                <h2>{t("useful")}</h2>
              </div>
              <p>{t("howText")}</p>
            </div>
            <div className="grid-3">
              {(["connect", "learn", "act"] as const).map((key, index) => (
                <article className="card card-accent" key={key}>
                  <div className="icon-box">{String(index + 1).padStart(2, "0")}</div>
                  <h3>{t(key)}</h3>
                  <p>{t(`${key}Text`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="stats-band">
          <div className="container stats-grid">
            {[t("people"), t("ways"), t("ideas"), t("progress")].map((label, index) => (
              <div className="stat" key={label}>
                <strong>{["01", "03", "∞", "→"][index]}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t("coming")}</span>
                <h2>{t("join")}</h2>
              </div>
              <Link className="btn btn-outline" href="/events">
                {t("allEvents")}
              </Link>
            </div>
            <div className="grid-2">
              {(events?.items ?? []).map((event) => (
                <article className="card" key={event.id}>
                  <span className="meta">{formatDate(event.event_date, true, locale)}</span>
                  <h3>{event.title}</h3>
                  {event.fallback && <small>{common("fallback")}</small>}
                  <p>{excerpt(event.description, 130)}</p>
                  <Link className="btn btn-sun btn-small" href="/contact">
                    {t("ask")}
                  </Link>
                </article>
              ))}
              {(!events || events.items.length === 0) && (
                <div className="empty-state">
                  {t("noEvents")} <Link href="/contact">{t("message")}</Link>
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t("stories")}</span>
                <h2>{t("storiesTitle")}</h2>
              </div>
              <Link className="btn btn-outline" href="/blog">
                {t("allNews")}
              </Link>
            </div>
            <div className="grid-2">
              {(posts?.items ?? []).map((post) => (
                <article className="card" key={post.id}>
                  <span className="meta">{t("communityNote")}</span>
                  <h3>{post.title}</h3>
                  {post.fallback && <small>{common("fallback")}</small>}
                  <p>{excerpt(post.content, 160)}</p>
                  <Link href={`/blog/${post.slug}`} className="meta">
                    {t("readStory")}
                  </Link>
                </article>
              ))}
              {(!posts || posts.items.length === 0) && (
                <div className="empty-state">{t("noPosts")}</div>
              )}
            </div>
          </div>
        </section>
        <section className="cta-band section">
          <div className="container cta-row">
            <h2>{t("cta")}</h2>
            <Link href="/contact" className="btn btn-primary">
              {t("conversation")}
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
