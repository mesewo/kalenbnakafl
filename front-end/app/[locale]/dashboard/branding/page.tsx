"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, type MediaItem, type SiteSettings, type SiteSettingsInput } from "@/lib/api";
import { fetchStaffImages } from "@/lib/staff-media";
import PageHeader from "@/components/ui/PageHeader";
import BilingualField from "@/components/ui/BilingualField";
import Field from "@/components/ui/Field";
import MediaAssetField from "@/components/ui/MediaAssetField";

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
      const [current, allMedia] = await Promise.all([settingsRequest, fetchStaffImages()]);
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
      <PageHeader
        eyebrow={t("siteContentEyebrow")}
        title={t("brandingTitle")}
        description={t("brandingHelp")}
      />
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
                  {mediaID ? null : (
                    <p className="branding-fallback">{t("brandingStaticFallback")}</p>
                  )}
                  {issue && (
                    <p className="status status-error" role="alert">
                      {issue}
                    </p>
                  )}
                  <MediaAssetField
                    mediaID={mediaID}
                    media={media}
                    hint={slotData[slot].hint}
                    chooseLabel={mediaID ? t("changeBrandImage") : t("chooseBrandImage")}
                    removeLabel={t("removeBrandImage")}
                    onChange={(nextID, selectedMedia) => chooseMedia(slot, nextID, selectedMedia)}
                    onRemove={() => removeMedia(slot)}
                    layoutClassName="branding-asset"
                    actionsClassName="form-actions"
                    previewClassName={`branding-preview branding-preview-${slot}`}
                    imageWidth={480}
                    imageHeight={270}
                    fileWidth={slot === "social" ? 960 : 480}
                  />
                </article>
              );
            })}
          </div>
          <div className="card branding-translations">
            <h2>{t("brandingTextTitle")}</h2>
            <BilingualField
              englishLabel={t("english")}
              amharicLabel={t("amharic")}
              missingEnglish={
                !settings.translations.en.site_name.trim() ||
                !settings.translations.en.tagline.trim()
              }
              missingAmharic={
                !settings.translations.am.site_name.trim() ||
                !settings.translations.am.tagline.trim()
              }
              missingEnglishLabel={t("missingEnglish")}
              missingAmharicLabel={t("missingAmharic")}
            >
              {(locale) => (
                <div className="branding-language">
                  <Field label={t("siteName")}>
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
                  </Field>
                  <Field label={t("siteTagline")}>
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
                  </Field>
                </div>
              )}
            </BilingualField>
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
    </section>
  );
}
