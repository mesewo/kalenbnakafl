import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localizedMetadata } from "@/lib/metadata";
import { fetchOptionalSiteContent } from "@/lib/site-content";
import { PublicMediaFigure } from "@/components/PublicMediaImage";
import type { AboutImage, MediaItem } from "@/lib/api";

export const revalidate = 60;
type Props = { params: Promise<{ locale: "en" | "am" }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return localizedMetadata(locale, "/about", t("about"), t("about"));
}
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const aboutImages = await fetchOptionalSiteContent<{ items: AboutImage[] }>(
    "/site/about-images",
    locale,
  );
  const images = (
    await Promise.all(
      (aboutImages?.items ?? []).map(async (item) => {
        const media = await fetchOptionalSiteContent<MediaItem>(`/media/${item.media_id}`, locale);
        return media ? { id: item.id, caption: item.caption, media } : null;
      }),
    )
  ).filter((item): item is { id: number; caption: string; media: MediaItem } => item !== null);
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
        <div className="container grid-2">
          <div>
            <span className="eyebrow">{t("guides")}</span>
            <h2 className="display">{t("shared")}</h2>
          </div>
          <div className="card">
            <p>{t("p1")}</p>
            <p>{t("p2")}</p>
            <Link className="btn btn-primary" href="/events">
              {t("gather")}
            </Link>
          </div>
        </div>
      </section>
      <section className="section" style={{ background: "var(--cream)" }}>
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">{t("approach")}</span>
              <h2>{t("grounded")}</h2>
            </div>
            <p>{t("approachText")}</p>
          </div>
          <div className="grid-3">
            {(["accessible", "practical", "collaborative"] as const).map((key, index) => (
              <article className="card" key={key}>
                <div className="icon-box">{String.fromCharCode(65 + index)}</div>
                <h3>{t(key)}</h3>
                <p>{t(`${key}Text`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      {images.length > 0 && (
        <section className="section about-image-section" aria-label={t("gallery")}>
          <div className="container">
            <div className="about-image-grid">
              {images.map((item) => (
                <PublicMediaFigure
                  key={item.id}
                  media={item.media}
                  caption={item.caption}
                  className="about-public-image"
                />
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="cta-band section">
        <div className="container cta-row">
          <h2>{t("cta")}</h2>
          <Link href="/volunteer" className="btn btn-primary">
            {t("volunteer")}
          </Link>
        </div>
      </section>
    </main>
  );
}
