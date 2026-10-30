"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatDate, type MediaItem, type PageResponse, type Post } from "@/lib/api";
import PostModal from "@/components/PostModal";
export default function PostsPage() {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [mediaByID, setMediaByID] = useState<Record<number, MediaItem>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<{ open: boolean; post: Post | null }>({
    open: false,
    post: null,
  });
  const prefix = "/staff";
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [postPage, mediaPage] = await Promise.all([
        apiFetch<PageResponse<Post>>(`${prefix}/posts?limit=50`, {}),
        apiFetch<PageResponse<MediaItem>>("/staff/media?kind=image&limit=100", {}),
      ]);
      setPosts(postPage.items || []);
      setMediaByID(Object.fromEntries(mediaPage.items.map((item) => [item.id, item])));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadPostsFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user]);
  useEffect(() => {
    void load();
  }, [load]);
  async function remove(post: Post) {
    if (!window.confirm(t("confirmDeletePost", { title: post.title }))) return;
    try {
      await apiFetch(`${prefix}/posts/${post.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deletePostFailed"));
    }
  }
  async function toggle(post: Post) {
    try {
      await apiFetch(`${prefix}/posts/${post.id}/publish`, {
        method: "PATCH",
        body: JSON.stringify({ published: !post.published }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("updatePostFailed"));
    }
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
  return (
    <div>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">{t("postsEyebrow")}</span>
          <h1>{t("posts")}</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ open: true, post: null })}>
          {t("newPost")}
        </button>
      </div>
      {error && (
        <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-state">{t("loadingPosts")}</div>
      ) : posts.length === 0 ? (
        <div className="empty-state">{t("noPosts")}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("title")}</th>
                <th>{t("status")}</th>
                <th>{t("updated")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    {renderCover(post.cover_media_id)}
                    <strong>{post.title}</strong>
                    {(!post.translations?.am?.title || !post.translations?.am?.content) && (
                      <span className="badge status-pending">{t("missingAmharic")}</span>
                    )}
                    {(!post.translations?.en?.title || !post.translations?.en?.content) && (
                      <span className="badge status-pending">{t("missingEnglish")}</span>
                    )}
                    <div>
                      <Link
                        href={`/blog/${post.slug}`}
                        locale={locale === "en" ? "am" : "en"}
                        className="meta"
                      >
                        {t("previewOtherLanguage")}
                      </Link>
                    </div>
                    <div className="meta">
                      {post.content.slice(0, 100)}
                      {post.content.length > 100 ? "…" : ""}
                    </div>
                  </td>
                  <td>
                    <span className="badge">
                      {post.published ? t("statusPublishedLabel") : t("statusDraftLabel")}
                    </span>
                  </td>
                  <td>{formatDate(post.updated_at || post.created_at, false, locale)}</td>
                  <td>
                    <div className="form-actions">
                      <button
                        className="btn btn-outline btn-small"
                        onClick={() => setModal({ open: true, post })}
                      >
                        {t("edit")}
                      </button>
                      <button className="btn btn-outline btn-small" onClick={() => toggle(post)}>
                        {post.published ? t("unpublish") : t("publish")}
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => remove(post)}>
                        {t("delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PostModal
        isOpen={modal.open}
        post={modal.post}
        onClose={() => setModal({ open: false, post: null })}
        onSuccess={load}
        userRole={user?.role}
      />
    </div>
  );
}
