import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { fetchPublic, PublicApiError } from "@/lib/server-api";
import { formatDate, type PageResponse, type Post } from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";
import { withEmptyArrayOnFailure } from "@/lib/server-api-core.mjs";

export const revalidate = 60;
export const dynamicParams = true;
type Props = { params: Promise<{ locale: "en" | "am"; slug: string }> };

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale;
  if (locale !== "en" && locale !== "am") return [];
  return withEmptyArrayOnFailure(async () => {
    const result = await fetchPublic<PageResponse<Post>>("/posts?limit=50", locale);
    return result?.items.map((post) => ({ slug: post.slug })) ?? [];
  });
}

async function getPost(slug: string, locale: "en" | "am"): Promise<Post | null> {
  try {
    return await fetchPublic<Post>(`/posts/${encodeURIComponent(slug)}`, locale);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) return null;
    throw error;
  }
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPost(slug, locale);
  const t = await getTranslations({ locale, namespace: "blog" });
  if (!post) return localizedMetadata(locale, `/blog/${slug}`, t("notFound"), t("notFound"));
  return localizedMetadata(
    locale,
    `/blog/${slug}`,
    `${post.title} | Kalen Benakafil`,
    post.content.slice(0, 160),
  );
}
export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await getPost(slug, locale);
  if (!post) notFound();
  const t = await getTranslations("blog");
  const common = await getTranslations("common");
  return (
    <main id="main-content">
      <section className="page-hero">
        <div className="container">
          <Link className="eyebrow" href="/blog">
            {t("back")}
          </Link>
          <h1>{post.title}</h1>
          {post.fallback && <p className="meta">{common("fallback")}</p>}
          <p>
            {formatDate(post.published_at || post.created_at, false, locale)}
            {post.author_name ? ` · ${post.author_name}` : ""}
          </p>
        </div>
      </section>
      <article className="section">
        <div className="container" style={{ maxWidth: "52rem" }}>
          <div className="lede" style={{ whiteSpace: "pre-wrap" }}>
            {post.content}
          </div>
        </div>
      </article>
    </main>
  );
}
