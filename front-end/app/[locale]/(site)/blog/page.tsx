import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { fetchPublic } from "@/lib/server-api";
import { excerpt, formatDate, type PageResponse, type Post } from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";
import PublicMediaImage from "@/components/PublicMediaImage";

export const revalidate = 60;
type Props = { params: Promise<{ locale: "en" | "am" }>; searchParams: Promise<{ page?: string }> };
export async function generateMetadata({ params }: Pick<Props, "params">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return localizedMetadata(locale, "/blog", `${t("blog")} | Kalen Benakafil`, t("blog"));
}
export default async function BlogPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const t = await getTranslations("blog");
  const common = await getTranslations("common");
  const result = await fetchPublic<PageResponse<Post>>(`/posts?page=${page}&limit=10`, locale);
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / (result?.limit || 10)));
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
            <div className="empty-state">{t("empty")}</div>
          ) : (
            <div className="grid-2">
              {result.items.map((post) => (
                <article className="card card-accent" key={post.id}>
                  <PublicMediaImage
                    mediaID={post.cover_media_id}
                    locale={locale}
                    className="public-media-card"
                  />
                  <span className="meta">
                    {formatDate(post.published_at || post.created_at, false, locale)}
                  </span>
                  <h2>{post.title}</h2>
                  {post.fallback && <small>{common("fallback")}</small>}
                  <p>{excerpt(post.content, 240)}</p>
                  <Link className="meta" href={`/blog/${post.slug}`}>
                    {t("read")}
                  </Link>
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
              aria-disabled={page <= 1}
              className="btn btn-outline"
              href={`/blog?page=${Math.max(1, page - 1)}`}
            >
              {t("previous")}
            </Link>
            <span className="meta">{t("page", { page, total: totalPages })}</span>
            <Link
              aria-disabled={page >= totalPages}
              className="btn btn-outline"
              href={`/blog?page=${Math.min(totalPages, page + 1)}`}
            >
              {t("next")}
            </Link>
          </nav>
        </div>
      </section>
      <section className="cta-band section">
        <div className="container cta-row">
          <h2>{t("cta")}</h2>
          <Link className="btn btn-primary" href="/contact">
            {t("talk")}
          </Link>
        </div>
      </section>
    </main>
  );
}
