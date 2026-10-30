import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  formatDate,
  excerpt,
  type EventItem,
  type HomeSlide,
  type MediaItem,
  type PageResponse,
  type Post,
  type SiteBlock,
} from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";
import { fetchOptionalSiteContent } from "@/lib/site-content";
import HomeSlider, { type HomeSliderItem } from "@/components/HomeSlider";
import { getSiteBlockText } from "@/lib/site-block-catalog";

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
  const [posts, events, homeSlides, content] = await Promise.all([
    fetchOptionalSiteContent<PageResponse<Post>>("/posts?limit=2", locale),
    fetchOptionalSiteContent<PageResponse<EventItem>>("/events?upcoming=true&limit=2", locale),
    fetchOptionalSiteContent<{ items: HomeSlide[] }>("/site/home-slides", locale),
    fetchOptionalSiteContent<{ items: SiteBlock[] }>("/site/blocks?page=home", locale),
  ]);
  const block = (key: string, defaultKey: string) =>
    getSiteBlockText(content?.items, key, t(defaultKey));
  const slides: HomeSliderItem[] = (
    await Promise.all(
      (homeSlides?.items ?? []).map(async (slide) => {
        const media = await fetchOptionalSiteContent<MediaItem>(`/media/${slide.media_id}`, locale);
        return media ? { id: slide.id, media, caption: slide.caption, link: slide.link } : null;
      }),
    )
  ).filter((slide): slide is HomeSliderItem => slide !== null);
  return (
    <>
      <main id="main-content">
        {slides.length > 0 && <HomeSlider slides={slides} />}
        {slides.length === 0 && (
          <section className="hero">
            <div className="container hero-grid">
              <div>
                <span className="eyebrow site-block-text">{block("hero_eyebrow", "eyebrow")}</span>
                <h1 className="display site-block-text">{block("hero_title", "title")}</h1>
                <p className="lede site-block-text">{block("hero_intro", "intro")}</p>
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
                <span className="eyebrow site-block-text" style={{ color: "var(--sun)" }}>
                  {block("hero_shared", "shared")}
                </span>
                <h2 className="site-block-text">{block("hero_thrive", "thrive")}</h2>
                <div className="hero-note">
                  <strong className="site-block-text">{block("hero_one", "one")}</strong>
                  <span className="site-block-text">{block("hero_one_text", "oneText")}</span>
                </div>
              </div>
            </div>
          </section>
        )}
        <section className="section">
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow site-block-text">{block("how_eyebrow", "how")}</span>
                <h2 className="site-block-text">{block("how_title", "useful")}</h2>
              </div>
              <p className="site-block-text">{block("how_intro", "howText")}</p>
            </div>
            <div className="grid-3">
              {(["connect", "learn", "act"] as const).map((key, index) => (
                <article className="card card-accent" key={key}>
                  <div className="icon-box">{String(index + 1).padStart(2, "0")}</div>
                  <h3 className="site-block-text">{block(`${key}_title`, key)}</h3>
                  <p className="site-block-text">{block(`${key}_text`, `${key}Text`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="stats-band">
          <div className="container stats-grid">
            {[
              block("stat_people", "people"),
              block("stat_ways", "ways"),
              block("stat_ideas", "ideas"),
              block("stat_progress", "progress"),
            ].map((label, index) => (
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
                <span className="eyebrow site-block-text">{block("coming_eyebrow", "coming")}</span>
                <h2 className="site-block-text">{block("coming_title", "join")}</h2>
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
                  <span className="site-block-text">{block("no_events_text", "noEvents")}</span>{" "}
                  <Link href="/contact">{t("message")}</Link>
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head">
              <div>
                <span className="eyebrow site-block-text">
                  {block("stories_eyebrow", "stories")}
                </span>
                <h2 className="site-block-text">{block("stories_title", "storiesTitle")}</h2>
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
                <div className="empty-state site-block-text">
                  {block("no_posts_text", "noPosts")}
                </div>
              )}
            </div>
          </div>
        </section>
        <section className="cta-band section">
          <div className="container cta-row">
            <h2 className="site-block-text">{block("cta_title", "cta")}</h2>
            <Link href="/contact" className="btn btn-primary">
              {t("conversation")}
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
