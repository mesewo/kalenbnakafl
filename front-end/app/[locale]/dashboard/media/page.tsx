"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/DashboardProviders";
import MediaUploadForm from "@/components/MediaUploadForm";
import { ApiError, apiFetch, formatDate, type MediaItem, type PageResponse } from "@/lib/api";

type MediaUsage = { usage_type: string; reference_id: number; label: string };

function isMediaUsage(value: unknown): value is MediaUsage {
  if (typeof value !== "object" || value === null) return false;
  return (
    "usage_type" in value &&
    typeof value.usage_type === "string" &&
    "reference_id" in value &&
    typeof value.reference_id === "number" &&
    "label" in value &&
    typeof value.label === "string"
  );
}

function mediaUsages(value: unknown): MediaUsage[] {
  return Array.isArray(value) ? value.filter(isMediaUsage) : [];
}

export default function MediaPage() {
  const displayLocale = useLocale();
  const t = useTranslations("dashboard");
  const confirm = useConfirm();
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [usages, setUsages] = useState<Record<number, MediaUsage[]>>({});
  const [blockedMediaID, setBlockedMediaID] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingID, setDeletingID] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const firstPage = await apiFetch<PageResponse<MediaItem>>(
        "/staff/media?kind=image&page=1&limit=50",
        {},
      );
      const pageCount = Math.max(1, Math.ceil(firstPage.total / 50));
      const otherPages: PageResponse<MediaItem>[] = [];
      for (let firstPageNumber = 2; firstPageNumber <= pageCount; firstPageNumber += 10) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(10, pageCount - firstPageNumber + 1) }, (_, index) =>
            apiFetch<PageResponse<MediaItem>>(
              `/staff/media?kind=image&page=${firstPageNumber + index}&limit=50`,
              {},
            ),
          ),
        );
        otherPages.push(...batch);
      }
      const allMedia = [...firstPage.items, ...otherPages.flatMap((page) => page.items)];
      setMedia(allMedia);
      setUsages({});
      setLoading(false);
      for (let offset = 0; offset < allMedia.length; offset += 10) {
        const usageBatch = await Promise.all(
          allMedia.slice(offset, offset + 10).map(async (item) => {
            const response = await apiFetch<{ usages: MediaUsage[] }>(
              `/staff/media/${item.id}/usages`,
              {},
            );
            return [item.id, response.usages] as const;
          }),
        );
        setUsages((current) => ({ ...current, ...Object.fromEntries(usageBatch) }));
      }
    } catch {
      setError(t("loadMediaFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleMedia = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return media;
    return media.filter((item) =>
      [item.title, item.original_name, item.alt_text].join(" ").toLocaleLowerCase().includes(term),
    );
  }, [media, search]);

  async function remove(item: MediaItem) {
    if (
      !(await confirm(
        t("confirmDeleteMedia", { title: item.title || item.original_name || t("mediaUntitled") }),
        t("delete"),
      ))
    ) {
      return;
    }
    setBlockedMediaID(null);
    setError("");
    setDeletingID(item.id);
    try {
      await apiFetch(`/staff/media/${item.id}`, { method: "DELETE" });
      await load();
    } catch (deleteError) {
      if (deleteError instanceof ApiError && deleteError.status === 409) {
        const currentUsages = mediaUsages(deleteError.details.usages);
        setUsages((current) => ({ ...current, [item.id]: currentUsages }));
        setBlockedMediaID(item.id);
        setError(t("mediaInUse"));
      } else {
        setError(t("deleteMediaFailed"));
      }
    } finally {
      setDeletingID(null);
    }
  }

  function usageLabel(usage: MediaUsage) {
    switch (usage.usage_type) {
      case "post_cover":
        return t("usagePostCover", { label: usage.label });
      case "post_inline":
        return t("usagePostInline", { label: usage.label });
      case "event_cover":
        return t("usageEventCover", { label: usage.label });
      case "home_slide":
        return t("usageHomeSlide", { label: usage.label });
      case "about_image":
        return t("usageAboutImage", { label: usage.label });
      case "site_setting":
        return t("usageSiteSetting", { label: usage.label });
      default:
        return usage.label;
    }
  }

  return (
    <div>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">{t("mediaEyebrow")}</span>
          <h1>{t("mediaTitle")}</h1>
          <p className="meta">{t("mediaLibraryHelp")}</p>
        </div>
      </div>
      <section className="form-card media-upload-card" aria-labelledby="media-upload-heading">
        <h2 id="media-upload-heading">{t("mediaAddImages")}</h2>
        <MediaUploadForm onUploaded={load} />
      </section>
      {error && (
        <div className="status status-error" role="alert" style={{ margin: "1rem 0" }}>
          {error}
        </div>
      )}
      <div className="media-library-toolbar">
        <label className="field">
          <span>{t("mediaSearch")}</span>
          <input
            type="search"
            value={search}
            placeholder={t("mediaSearchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <p className="meta">{t("mediaImageCount", { count: visibleMedia.length })}</p>
      </div>
      {loading ? (
        <div className="empty-state" role="status">
          {t("loadingMedia")}
        </div>
      ) : visibleMedia.length === 0 ? (
        <div className="empty-state">{search ? t("mediaNoSearchResults") : t("noMedia")}</div>
      ) : (
        <div className="media-library-grid">
          {visibleMedia.map((item) => (
            <article className="card media-library-card" key={item.id}>
              <div className="media-library-thumb">
                <Image
                  src={`/api/staff/media/${item.id}/file?w=960`}
                  alt={item.decorative ? "" : item.alt_text}
                  width={item.width || 960}
                  height={item.height || 540}
                  sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw"
                  loading="lazy"
                  unoptimized
                />
              </div>
              <div className="media-library-details">
                <div>
                  <h2>{item.title || item.original_name || t("mediaUntitled")}</h2>
                  <p className="meta">
                    {t("mediaDimensions", { width: item.width, height: item.height })}
                  </p>
                  <p className="meta">{formatDate(item.created_at, false, displayLocale)}</p>
                </div>
                <section className="media-usage-panel" aria-label={t("mediaUsageHeading")}>
                  <h3>{t("mediaUsageHeading")}</h3>
                  {usages[item.id] ? (
                    usages[item.id].length ? (
                      <ul>
                        {usages[item.id].map((usage, index) => (
                          <li key={`${usage.usage_type}-${usage.reference_id}-${index}`}>
                            {usageLabel(usage)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="meta">{t("mediaUnused")}</p>
                    )
                  ) : (
                    <p className="meta">{t("loadingMedia")}</p>
                  )}
                  {blockedMediaID === item.id && (
                    <p className="media-delete-blocked" role="status">
                      {t("mediaCannotDeleteInUse")}
                    </p>
                  )}
                </section>
                <div className="form-actions">
                  <a
                    className="btn btn-outline btn-small"
                    href={`/api/staff/media/${item.id}/file?w=1600`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("openFile")}
                  </a>
                  <button
                    className="btn btn-danger btn-small"
                    type="button"
                    disabled={deletingID === item.id}
                    onClick={() => void remove(item)}
                  >
                    {deletingID === item.id ? t("deleting") : t("delete")}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
