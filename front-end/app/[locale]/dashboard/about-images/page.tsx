"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/DashboardProviders";
import MediaPicker from "@/components/MediaPicker";
import { apiFetch, type AboutImage, type AboutImageInput } from "@/lib/api";

type AboutImageDraft = {
  id?: number;
  media_id: number | null;
  sort_order: number;
  translations: { en: { caption: string }; am: { caption: string } };
};

function toDraft(item: AboutImage): AboutImageDraft {
  return {
    id: item.id,
    media_id: item.media_id,
    sort_order: item.sort_order,
    translations: {
      en: { caption: item.translations?.en.caption ?? "" },
      am: { caption: item.translations?.am.caption ?? "" },
    },
  };
}

function inputFor(item: AboutImageDraft, order = item.sort_order): AboutImageInput {
  return {
    media_id: item.media_id ?? 0,
    sort_order: order,
    translations: item.translations,
  };
}

export default function AboutImagesAdminPage() {
  const t = useTranslations("dashboard");
  const confirm = useConfirm();
  const { user } = useAuth();
  const [images, setImages] = useState<AboutImageDraft[]>([]);
  const [newImage, setNewImage] = useState<AboutImageDraft | null>(null);
  const [pickerFor, setPickerFor] = useState<number | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<{ items: AboutImage[] }>("/admin/about-images", {});
      setImages(response.items.map(toDraft));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("siteContentLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateImage(id: number, update: Partial<AboutImageDraft>) {
    setImages((current) =>
      current.map((image) => (image.id === id ? { ...image, ...update } : image)),
    );
  }

  async function saveImage(image: AboutImageDraft) {
    if (!image.media_id) {
      setError(t("aboutImageChooseImage"));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(image.id ? `/admin/about-images/${image.id}` : "/admin/about-images", {
        method: image.id ? "PUT" : "POST",
        body: JSON.stringify(inputFor(image)),
      });
      if (!image.id) setNewImage(null);
      setNotice(t("siteContentSaved"));
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("siteContentSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function removeImage(image: AboutImageDraft) {
    if (!image.id || !(await confirm(t("confirmDeleteAboutImage"), t("delete")))) return;
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/about-images/${image.id}`, { method: "DELETE" });
      setNotice(t("siteContentDeleted"));
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("siteContentSaveFailed"));
    }
  }

  async function moveImage(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setSaving(true);
    setError("");
    try {
      for (const [order, image] of reordered.entries()) {
        if (!image.id) continue;
        await apiFetch(`/admin/about-images/${image.id}`, {
          method: "PUT",
          body: JSON.stringify(inputFor(image, order)),
        });
      }
      setImages(reordered.map((image, order) => ({ ...image, sort_order: order })));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("siteContentSaveFailed"));
      await load();
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

  return (
    <section>
      <div className="dashboard-title">
        <div>
          <span className="eyebrow">{t("siteContentEyebrow")}</span>
          <h1>{t("aboutImagesTitle")}</h1>
          <p>{t("aboutImagesHelp")}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            setNewImage({
              media_id: null,
              sort_order: images.length,
              translations: { en: { caption: "" }, am: { caption: "" } },
            })
          }
          disabled={Boolean(newImage) || saving}
        >
          {t("addAboutImage")}
        </button>
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
      {loading ? (
        <p className="empty-state" role="status">
          {t("loadingSiteContent")}
        </p>
      ) : images.length === 0 && !newImage ? (
        <p className="empty-state">{t("noAboutImages")}</p>
      ) : (
        <div className="site-content-list">
          {images.map((image, index) => (
            <article className="card site-content-card" key={image.id}>
              <div className="site-content-card-head">
                <h2>{t("aboutImageNumber", { number: index + 1 })}</h2>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => void moveImage(index, -1)}
                    disabled={index === 0 || saving}
                  >
                    {t("moveAboutImageUp")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => void moveImage(index, 1)}
                    disabled={index === images.length - 1 || saving}
                  >
                    {t("moveAboutImageDown")}
                  </button>
                </div>
              </div>
              <div className="site-content-image-row">
                {image.media_id ? (
                  <Image
                    className="site-content-thumb"
                    src={`/api/staff/media/${image.media_id}/file?w=480`}
                    alt=""
                    width={480}
                    height={270}
                    unoptimized
                  />
                ) : (
                  <div className="site-content-thumb cover-placeholder" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setPickerFor(image.id ?? null)}
                >
                  {t("chooseAboutImage")}
                </button>
              </div>
              <div className="grid-2">
                {(["en", "am"] as const).map((locale) => (
                  <label className="field" key={locale}>
                    <span>{t(locale === "en" ? "englishCaption" : "amharicCaption")}</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={image.translations[locale].caption}
                      onChange={(event) =>
                        updateImage(image.id!, {
                          translations: {
                            ...image.translations,
                            [locale]: { caption: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void saveImage(image)}
                  disabled={saving}
                >
                  {t("saveChanges")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => void removeImage(image)}
                  disabled={saving}
                >
                  {t("delete")}
                </button>
              </div>
            </article>
          ))}
          {newImage && (
            <article className="card site-content-card">
              <h2>{t("addAboutImage")}</h2>
              <div className="site-content-image-row">
                {newImage.media_id ? (
                  <Image
                    className="site-content-thumb"
                    src={`/api/staff/media/${newImage.media_id}/file?w=480`}
                    alt=""
                    width={480}
                    height={270}
                    unoptimized
                  />
                ) : (
                  <div className="site-content-thumb cover-placeholder" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setPickerFor("new")}
                >
                  {t("chooseAboutImage")}
                </button>
              </div>
              <div className="grid-2">
                {(["en", "am"] as const).map((locale) => (
                  <label className="field" key={locale}>
                    <span>{t(locale === "en" ? "englishCaption" : "amharicCaption")}</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={newImage.translations[locale].caption}
                      onChange={(event) =>
                        setNewImage({
                          ...newImage,
                          translations: {
                            ...newImage.translations,
                            [locale]: { caption: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void saveImage(newImage)}
                  disabled={saving || !newImage.media_id}
                >
                  {t("addAboutImage")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setNewImage(null)}
                  disabled={saving}
                >
                  {t("cancel")}
                </button>
              </div>
            </article>
          )}
        </div>
      )}
      <MediaPicker
        isOpen={pickerFor !== null}
        selectedMediaID={
          pickerFor === "new"
            ? newImage?.media_id
            : (images.find((image) => image.id === pickerFor)?.media_id ?? null)
        }
        slotHint={t("aboutImageSizeHint")}
        onClose={() => setPickerFor(null)}
        onSelect={(mediaID) => {
          if (pickerFor === "new")
            setNewImage((current) => current && { ...current, media_id: mediaID });
          else if (typeof pickerFor === "number") updateImage(pickerFor, { media_id: mediaID });
          setPickerFor(null);
        }}
      />
    </section>
  );
}
