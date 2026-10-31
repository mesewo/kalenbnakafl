"use client";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { useConfirm, useToast } from "@/components/DashboardProviders";
import { apiFetch, formatDate, type MediaItem, type PageResponse, type Post } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import PostModal from "@/components/PostModal";

type PostsQueryData = { posts: Post[]; mediaByID: Record<number, MediaItem> };

export default function PostsPage() {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const confirm = useConfirm();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [modal, setModal] = useState<{ open: boolean; post: Post | null }>({
    open: false,
    post: null,
  });
  const postsQuery = useQuery({
    queryKey: queryKeys.posts,
    enabled: Boolean(user),
    queryFn: async (): Promise<PostsQueryData> => {
      const [postPage, mediaPage] = await Promise.all([
        apiFetch<PageResponse<Post>>("/staff/posts?limit=50", {}),
        apiFetch<PageResponse<MediaItem>>("/staff/media?kind=image&limit=100", {}),
      ]);
      return {
        posts: postPage.items ?? [],
        mediaByID: Object.fromEntries(mediaPage.items.map((item) => [item.id, item])),
      };
    },
  });
  const posts = postsQuery.data?.posts ?? [];
  const mediaByID = postsQuery.data?.mediaByID ?? {};
  const deleteMutation = useMutation({
    mutationFn: (post: Post) => apiFetch(`/staff/posts/${post.id}`, { method: "DELETE" }),
    onMutate: async (post) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts });
      const previous = queryClient.getQueryData<PostsQueryData>(queryKeys.posts);
      queryClient.setQueryData<PostsQueryData>(queryKeys.posts, (current) =>
        current
          ? { ...current, posts: current.posts.filter((item) => item.id !== post.id) }
          : current,
      );
      return { previous };
    },
    onError: (cause, _post, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.posts, context.previous);
      const message = cause instanceof Error ? cause.message : t("deletePostFailed");
      setError(message);
      showToast(message, "error");
    },
    onSuccess: () => {
      setError("");
      showToast(t("postDeleted"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts }),
  });
  const publishMutation = useMutation({
    mutationFn: (post: Post) =>
      apiFetch(`/staff/posts/${post.id}/publish`, {
        method: "PATCH",
        body: JSON.stringify({ published: !post.published }),
      }),
    onMutate: async (post) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts });
      const previous = queryClient.getQueryData<PostsQueryData>(queryKeys.posts);
      queryClient.setQueryData<PostsQueryData>(queryKeys.posts, (current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((item) =>
                item.id === post.id ? { ...item, published: !post.published } : item,
              ),
            }
          : current,
      );
      return { previous };
    },
    onError: (cause, _post, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.posts, context.previous);
      const message = cause instanceof Error ? cause.message : t("updatePostFailed");
      setError(message);
      showToast(message, "error");
    },
    onSuccess: () => {
      setError("");
      showToast(t("postStatusUpdated"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts }),
  });

  async function remove(post: Post) {
    if (!(await confirm(t("confirmDeletePost", { title: post.title }), t("delete")))) return;
    setError("");
    await deleteMutation.mutateAsync(post).catch(() => undefined);
  }

  async function toggle(post: Post) {
    setError("");
    await publishMutation.mutateAsync(post).catch(() => undefined);
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
      {postsQuery.isPending ? (
        <div className="table-wrap" aria-label={t("loadingPosts")} role="status">
          <table className="data-table">
            <tbody>
              {Array.from({ length: 5 }, (_, index) => (
                <tr className="skeleton-row" key={index}>
                  <td aria-hidden="true" colSpan={4} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : postsQuery.isError ? (
        <div className="status status-error" role="alert">
          {postsQuery.error instanceof Error ? postsQuery.error.message : t("loadPostsFailed")}
        </div>
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
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.posts });
          showToast(t("contentSaved"));
        }}
        userRole={user?.role}
      />
    </div>
  );
}
