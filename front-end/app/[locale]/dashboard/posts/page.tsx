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
import PageHeader from "@/components/ui/PageHeader";
import DataTable from "@/components/ui/DataTable";

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
      <PageHeader
        eyebrow={t("postsEyebrow")}
        title={t("posts")}
        action={
          <button className="btn btn-primary" onClick={() => setModal({ open: true, post: null })}>
            {t("newPost")}
          </button>
        }
      />
      <DataTable
        rows={posts}
        rowKey={(post) => post.id}
        loading={postsQuery.isPending}
        loadingLabel={t("loadingPosts")}
        error={
          error ||
          (postsQuery.isError
            ? postsQuery.error instanceof Error
              ? postsQuery.error.message
              : t("loadPostsFailed")
            : undefined)
        }
        emptyState={t("noPosts")}
        searchable
        searchPlaceholder={t("searchPosts")}
        columns={[
          {
            id: "title",
            label: t("title"),
            header: t("title"),
            cell: (post) => (
              <>
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
              </>
            ),
            searchText: (post) => `${post.title} ${post.content}`,
            sortValue: (post) => post.title,
          },
          {
            id: "status",
            label: t("status"),
            header: t("status"),
            cell: (post) => (
              <span className="badge">
                {post.published ? t("statusPublishedLabel") : t("statusDraftLabel")}
              </span>
            ),
            sortValue: (post) => Number(post.published),
          },
          {
            id: "updated",
            label: t("updated"),
            header: t("updated"),
            cell: (post) => formatDate(post.updated_at || post.created_at, false, locale),
            sortValue: (post) => post.updated_at || post.created_at || "",
          },
          {
            id: "actions",
            label: t("actions"),
            header: t("actions"),
            cell: (post) => (
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
            ),
          },
        ]}
      />
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
