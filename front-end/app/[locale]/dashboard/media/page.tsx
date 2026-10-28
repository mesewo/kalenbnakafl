"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, formatDate, type MediaItem, type PageResponse } from "@/lib/api";
import type { components } from "@/types/api.d.ts";
type Locale = "en" | "am";
type MediaTranslations = components["schemas"]["MediaTranslations"];
export default function MediaPage() {
  const displayLocale = useLocale();
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [titles, setTitles] = useState<Record<Locale, string>>({ en: "", am: "" });
  const [locale, setLocale] = useState<Locale>("en");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const prefix = "/staff";
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setMedia(
        (await (await apiFetch<PageResponse<MediaItem>>(`${prefix}/media?limit=50`, {})).items) ||
          [],
      );
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
    const translations: MediaTranslations = {};
    for (const language of ["en", "am"] as const) {
      const value = titles[language].trim();
      if (value) translations[language] = { title: value };
    }
    if (!file || !Object.keys(translations).length) {
      setError(t("mediaTitleAndFileRequired"));
      return;
    }
    const body = new FormData();
    body.append("translations", JSON.stringify(translations));
    body.append("file", file);
    setUploading(true);
    setError("");
    try {
      await apiFetch(`${prefix}/media`, { method: "POST", body });
      setTitles({ en: "", am: "" });
      setFile(null);
      const input = document.getElementById("media-file") as HTMLInputElement | null;
      if (input) input.value = "";
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadMediaFailed"));
    } finally {
      setUploading(false);
    }
  }
  async function remove(item: MediaItem) {
    if (!window.confirm(t("confirmDeleteMedia", { title: item.title }))) return;
    try {
      await apiFetch(`${prefix}/media/${item.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deleteMediaFailed"));
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
              <label htmlFor="media-file">{t("file")}</label>
              <input
                id="media-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,audio/mpeg,audio/ogg,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <p className="meta">{t("addMediaTitle")}</p>
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
              <h3>{item.title}</h3>
              <p>{item.original_name || item.file_path}</p>
              <div className="form-actions">
                <a
                  className="btn btn-outline btn-small"
                  href={item.file_path}
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
