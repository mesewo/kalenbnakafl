"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import MediaPicker from "@/components/MediaPicker";
import {
  apiFetch,
  type MediaItem,
  type PageResponse,
  type SiteSettings,
  type SiteSettingsInput,
} from "@/lib/api";

type BrandingSlot = "logo" | "favicon" | "social";
type BrandingDraft = {
  logo_media_id: number | null;
  favicon_media_id: number | null;
  social_image_media_id: number | null;
  translations: {
    en: { site_name: string; tagline: string };
    am: { site_name: string; tagline: string };
  };
};

const slotMediaKey: Record<
  BrandingSlot,
  keyof Pick<BrandingDraft, "logo_media_id" | "favicon_media_id" | "social_image_media_id">
> = {
  logo: "logo_media_id",
  favicon: "favicon_media_id",
  social: "social_image_media_id",
};

function toDraft(settings: SiteSettings): BrandingDraft {
  return {
    logo_media_id: settings.logo_media_id ?? null,
    favicon_media_id: settings.favicon_media_id ?? null,
    social_image_media_id: settings.social_image_media_id ?? null,
    translations: {
      en: {
        site_name: settings.translations?.en.site_name ?? settings.site_name,
        tagline: settings.translations?.en.tagline ?? settings.tagline,
      },
      am: {
        site_name: settings.translations?.am.site_name ?? "",
        tagline: settings.translations?.am.tagline ?? "",
      },
    },
  };
}

function imageIssue(
  slot: BrandingSlot,
  media: MediaItem | undefined,
  t: ReturnType<typeof useTranslations>,
) {
  if (!media) return t("brandingImageDetailsMissing");
  const width = media.width;
  const height = media.height;
  const ratio = width / height;
  if (slot === "logo" && (width < 320 || height < 80 || ratio < 2 || ratio > 5)) {
    return t("brandingLogoDimensionsInvalid");
  }
  if (slot === "favicon" && (width < 512 || height < 512 || Math.abs(ratio - 1) > 0.02)) {
    return t("brandingFaviconDimensionsInvalid");
  }
  if (slot === "social" && (width < 1200 || height < 630 || ratio < 1.8 || ratio > 2)) {
    return t("brandingSocialDimensionsInvalid");
  }
  return "";
}

export default function BrandingAdminPage() {
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  const [settings, setSettings] = useState<BrandingDraft | null>(null);
  const [mediaByID, setMediaByID] = useState<Record<number, MediaItem>>({});
  const [pickerFor, setPickerFor] = useState<BrandingSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    setLoading(true);
    setError("");
    try {
      const settingsRequest = apiFetch<SiteSettings>("/admin/site-settings", {});
      const firstPageRequest = apiFetch<PageResponse<MediaItem>>(
        "/staff/media?kind=image&page=1&limit=50",
        {},
      );
      const [current, firstPage] = await Promise.all([settingsRequest, firstPageRequest]);
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
      setSettings(toDraft(current));
      setMediaByID(Object.fromEntries(allMedia.map((media) => [media.id, media])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("siteContentLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const validationIssues = useMemo(() => {
    if (!settings) return [];
    return (["logo", "favicon", "social"] as const).flatMap((slot) => {
      const mediaID = settings[slotMediaKey[slot]];
      if (!mediaID) return [];
      const message = imageIssue(slot, mediaByID[mediaID], t);
      return message ? [{ slot, message }] : [];
    });
  }, [mediaByID, settings, t]);

  function chooseMedia(slot: BrandingSlot, mediaID: number, media?: MediaItem) {
    if (!settings) return;
    setSettings({ ...settings, [slotMediaKey[slot]]: mediaID });
    if (media) setMediaByID((current) => ({ ...current, [media.id]: media }));
    setPickerFor(null);
  }

  function removeMedia(slot: BrandingSlot) {
    if (!settings) return;
    setSettings({ ...settings, [slotMediaKey[slot]]: null });
  }

  async function save() {
    if (!settings) return;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const payload: SiteSettingsInput = {
        logo_media_id: settings.logo_media_id,
        favicon_media_id: settings.favicon_media_id,
        social_image_media_id: settings.social_image_media_id,
        translations: settings.translations,
      };
      await apiFetch("/admin/site-settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setNotice(t("siteContentSaved"));
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("siteContentSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "admin") {
    return (
      <p className="status status-error" role="alert">
        {t("accessDenied")}
      </p>
    );
  }

  const slotData: Record<BrandingSlot, { title: string; hint: string }> = {
    logo: { title: t("brandingLogo"), hint: t("brandingLogoHint") },
    favicon: { title: t("brandingFavicon"), hint: t("brandingFaviconHint") },
    social: { title: t("brandingSocialImage"), hint: t("brandingSocialImageHint") },
  };

  return (
    <section>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">{t("siteContentEyebrow")}</span>
          <h1>{t("brandingTitle")}</h1>
          <p>{t("brandingHelp")}</p>
        </div>
      </div>
      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="status status-success" role="status">
          {notice}
        </p>
      )}
      {loading || !settings ? (
        <p className="empty-state" role="status">
          {t("loadingSiteContent")}
        </p>
      ) : (
        <>
          <div className="grid-2">
            {(["logo", "favicon", "social"] as const).map((slot) => {
              const mediaID = settings[slotMediaKey[slot]];
              const media = mediaID ? mediaByID[mediaID] : undefined;
              const issue = mediaID ? imageIssue(slot, media, t) : "";
              return (
                <article className="card branding-slot" key={slot}>
                  <h2>{slotData[slot].title}</h2>
                  <p>{slotData[slot].hint}</p>
                  {mediaID && media ? (
                    <Image
                      className={`branding-preview branding-preview-${slot}`}
                      src={`/api/staff/media/${mediaID}/file?w=${slot === "social" ? 960 : 480}`}
                      alt={media.decorative ? "" : media.alt_text}
                      width={media.width || 480}
                      height={media.height || 270}
                      unoptimized
                    />
                  ) : (
                    <p className="branding-fallback">{t("brandingStaticFallback")}</p>
                  )}
                  {issue && (
                    <p className="status status-error" role="alert">
                      {issue}
                    </p>
                  )}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setPickerFor(slot)}
                    >
                      {mediaID ? t("changeBrandImage") : t("chooseBrandImage")}
                    </button>
                    {mediaID && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => removeMedia(slot)}
                      >
                        {t("removeBrandImage")}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="card branding-translations">
            <h2>{t("brandingTextTitle")}</h2>
            <div className="grid-2">
              {(["en", "am"] as const).map((locale) => (
                <fieldset className="branding-language" key={locale}>
                  <legend>{t(locale === "en" ? "english" : "amharic")}</legend>
                  <label className="field">
                    <span>{t("siteName")}</span>
                    <input
                      required
                      maxLength={180}
                      value={settings.translations[locale].site_name}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          translations: {
                            ...settings.translations,
                            [locale]: {
                              ...settings.translations[locale],
                              site_name: event.target.value,
                            },
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>{t("siteTagline")}</span>
                    <textarea
                      required
                      rows={3}
                      maxLength={1000}
                      value={settings.translations[locale].tagline}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          translations: {
                            ...settings.translations,
                            [locale]: {
                              ...settings.translations[locale],
                              tagline: event.target.value,
                            },
                          },
                        })
                      }
                    />
                  </label>
                </fieldset>
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={
                saving ||
                validationIssues.length > 0 ||
                Object.values(settings.translations).some(
                  (translation) => !translation.site_name.trim() || !translation.tagline.trim(),
                )
              }
            >
              {saving ? t("saving") : t("saveChanges")}
            </button>
          </div>
        </>
      )}
      <MediaPicker
        isOpen={pickerFor !== null}
        selectedMediaID={pickerFor ? settings?.[slotMediaKey[pickerFor]] : null}
        slotHint={pickerFor ? slotData[pickerFor].hint : ""}
        onClose={() => setPickerFor(null)}
        onSelect={(mediaID, item) => {
          if (pickerFor) chooseMedia(pickerFor, mediaID, item);
        }}
      />
    </section>
  );
}
