"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, ApiError, formatDate, type MediaItem, type PageResponse } from "@/lib/api";

type Locale = "en" | "am";
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
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [usages, setUsages] = useState<Record<number, MediaUsage[]>>({});
  const [blockedMediaID, setBlockedMediaID] = useState<number | null>(null);
  const [titles, setTitles] = useState<Record<Locale, string>>({ en: "", am: "" });
  const [altTexts, setAltTexts] = useState<Record<Locale, string>>({ en: "", am: "" });
  const [locale, setLocale] = useState<Locale>("en");
  const [file, setFile] = useState<File | null>(null);
  const [decorative, setDecorative] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const prefix = "/staff";
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await apiFetch<PageResponse<MediaItem>>(`${prefix}/media?limit=50`, {});
      setMedia(result.items || []);
      const currentUsages = await Promise.all(
        result.items.map(async (item) => {
          const response = await apiFetch<{ usages: MediaUsage[] }>(
            `${prefix}/media/${item.id}/usages`,
            {},
          );
          return [item.id, response.usages] as const;
        }),
      );
      setUsages(Object.fromEntries(currentUsages));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadMediaFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user]);
  useEffect(() => {
    void load();
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || (!decorative && (!altTexts.en.trim() || !altTexts.am.trim()))) {
      setError(t("mediaAltRequired"));
      return;
    }
    const translations: Record<Locale, { title?: string; alt_text?: string }> = {
      en: {},
      am: {},
    };
    for (const language of ["en", "am"] as const) {
      const title = titles[language].trim();
      const altText = altTexts[language].trim();
      if (title) translations[language].title = title;
      if (altText) translations[language].alt_text = altText;
    }
    const body = new FormData();
    body.append("translations", JSON.stringify(translations));
    body.append("decorative", String(decorative));
    body.append("file", file);
    setUploading(true);
    setError("");
    try {
      await apiFetch(`${prefix}/media`, { method: "POST", body });
      setTitles({ en: "", am: "" });
      setAltTexts({ en: "", am: "" });
      setDecorative(false);
      setFile(null);
      const input = document.getElementById("media-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadMediaFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function remove(item: MediaItem) {
    if (!window.confirm(t("confirmDeleteMedia", { title: item.title }))) return;
    setBlockedMediaID(null);
    try {
      await apiFetch(`${prefix}/media/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setUsages((current) => ({ ...current, [item.id]: mediaUsages(err.details.usages) }));
        setBlockedMediaID(item.id);
        setError(t("mediaInUse"));
        return;
      }
      setError(err instanceof Error ? err.message : t("deleteMediaFailed"));
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
        </div>
      </div>
      <div className="form-card" style={{ marginBottom: "1.5rem" }}>
        <form onSubmit={upload}>
          <div role="tablist" aria-label={t("mediaLanguage")}>
            <button
              type="button"
              role="tab"
              aria-selected={locale === "en"}
              onClick={() => setLocale("en")}
            >
              {t("english")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={locale === "am"}
              onClick={() => setLocale("am")}
            >
              {t("amharic")}
            </button>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="media-title">
                {t("title")} {"("}
                {locale === "en" ? t("english") : t("amharic")}
                {")"}
              </label>
              <input
                id="media-title"
                value={titles[locale]}
                maxLength={180}
                onChange={(e) => setTitles((current) => ({ ...current, [locale]: e.target.value }))}
                placeholder={t("communityPhoto")}
              />
            </div>
            <div className="field">
              <label htmlFor="media-alt-text">
                {t("mediaAltText")} {"("}
                {locale === "en" ? t("english") : t("amharic")}
                {")"}
              </label>
              <input
                id="media-alt-text"
                value={altTexts[locale]}
                maxLength={500}
                disabled={decorative}
                onChange={(e) =>
                  setAltTexts((current) => ({ ...current, [locale]: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="media-file">{t("file")}</label>
              <input
                id="media-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={decorative}
                onChange={(e) => setDecorative(e.target.checked)}
              />
              {t("decorativeImage")}
            </label>
          </div>
          <p className="meta">{t("mediaAltHelp")}</p>
          <button className="btn btn-primary" disabled={uploading}>
            {uploading ? t("uploading") : t("uploadMedia")}
          </button>
        </form>
      </div>
      {error && (
        <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {loading ? (
        <div className="empty-state">{t("loadingMedia")}</div>
      ) : media.length === 0 ? (
        <div className="empty-state">{t("noMedia")}</div>
      ) : (
        <div className="grid-3">
          {media.map((item) => (
            <article className="card" key={item.id}>
              <span className="meta">{formatDate(item.created_at, false, displayLocale)}</span>
              <Image
                src={`/api/staff/media/${item.id}/file?w=480`}
                alt={item.decorative ? "" : item.alt_text}
                width={item.width || 480}
                height={item.height || 270}
                unoptimized
              />
              <h3>{item.title || item.original_name || t("decorativeImage")}</h3>
              <p>{item.original_name || `${item.width} × ${item.height}`}</p>
              <div>
                <strong>{t("mediaUsageHeading")}</strong>
                {usages[item.id]?.length ? (
                  <ul>
                    {usages[item.id].map((usage, index) => (
                      <li key={`${usage.usage_type}-${usage.reference_id}-${index}`}>
                        {usageLabel(usage)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t("mediaUnused")}</p>
                )}
              </div>
              {blockedMediaID === item.id && (
                <p className="meta" role="status">
                  {t("mediaCannotDeleteInUse")}
                </p>
              )}
              <div className="form-actions">
                <a
                  className="btn btn-outline btn-small"
                  href={`/api/staff/media/${item.id}/file?w=1600`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("openFile")}
                </a>
                <button className="btn btn-danger btn-small" onClick={() => remove(item)}>
                  {t("delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
