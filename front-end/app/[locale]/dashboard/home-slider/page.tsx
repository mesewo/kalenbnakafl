"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/DashboardProviders";
import MediaPicker from "@/components/MediaPicker";
import { apiFetch, type HomeSlide, type HomeSlideInput } from "@/lib/api";

type SlideDraft = {
  id?: number;
  media_id: number | null;
  link: string;
  sort_order: number;
  active: boolean;
  translations: { en: { caption: string }; am: { caption: string } };
};

function toDraft(slide: HomeSlide): SlideDraft {
  return {
    id: slide.id,
    media_id: slide.media_id,
    link: slide.link,
    sort_order: slide.sort_order,
    active: slide.active,
    translations: {
      en: { caption: slide.translations?.en.caption ?? "" },
      am: { caption: slide.translations?.am.caption ?? "" },
    },
  };
}

function inputFor(slide: SlideDraft, order = slide.sort_order): HomeSlideInput {
  return {
    media_id: slide.media_id ?? 0,
    link: slide.link,
    sort_order: order,
    active: slide.active,
    translations: slide.translations,
  };
}

export default function HomeSliderAdminPage() {
  const t = useTranslations("dashboard");
  const confirm = useConfirm();
  const { user } = useAuth();
  const [slides, setSlides] = useState<SlideDraft[]>([]);
  const [newSlide, setNewSlide] = useState<SlideDraft | null>(null);
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
      const response = await apiFetch<{ items: HomeSlide[] }>("/admin/home-slides", {});
      setSlides(response.items.map(toDraft));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("siteContentLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateSlide(id: number, update: Partial<SlideDraft>) {
    setSlides((current) =>
      current.map((slide) => (slide.id === id ? { ...slide, ...update } : slide)),
    );
  }

  async function saveSlide(slide: SlideDraft) {
    if (!slide.media_id) {
      setError(t("homeSlideChooseImage"));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(slide.id ? `/admin/home-slides/${slide.id}` : "/admin/home-slides", {
        method: slide.id ? "PUT" : "POST",
        body: JSON.stringify(inputFor(slide)),
      });
      if (!slide.id) setNewSlide(null);
      setNotice(t("siteContentSaved"));
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("siteContentSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function removeSlide(slide: SlideDraft) {
    if (!slide.id || !(await confirm(t("confirmDeleteSlide"), t("delete")))) return;
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/home-slides/${slide.id}`, { method: "DELETE" });
      setNotice(t("siteContentDeleted"));
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("siteContentSaveFailed"));
    }
  }

  async function moveSlide(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= slides.length) return;
    const reordered = [...slides];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setSaving(true);
    setError("");
    try {
      for (const [order, slide] of reordered.entries()) {
        if (!slide.id) continue;
        await apiFetch(`/admin/home-slides/${slide.id}`, {
          method: "PUT",
          body: JSON.stringify(inputFor(slide, order)),
        });
      }
      setSlides(reordered.map((slide, order) => ({ ...slide, sort_order: order })));
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
          <h1>{t("homeSliderTitle")}</h1>
          <p>{t("homeSliderHelp")}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            setNewSlide({
              media_id: null,
              link: "",
              sort_order: slides.length,
              active: true,
              translations: { en: { caption: "" }, am: { caption: "" } },
            })
          }
          disabled={Boolean(newSlide) || saving}
        >
          {t("addHomeSlide")}
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
      ) : slides.length === 0 && !newSlide ? (
        <p className="empty-state">{t("noHomeSlides")}</p>
      ) : (
        <div className="site-content-list">
          {slides.map((slide, index) => (
            <article className="card site-content-card" key={slide.id}>
              <div className="site-content-card-head">
                <h2>{t("homeSlideNumber", { number: index + 1 })}</h2>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => void moveSlide(index, -1)}
                    disabled={index === 0 || saving}
                  >
                    {t("moveSlideUp")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => void moveSlide(index, 1)}
                    disabled={index === slides.length - 1 || saving}
                  >
                    {t("moveSlideDown")}
                  </button>
                </div>
              </div>
              <div className="site-content-image-row">
                {slide.media_id ? (
                  <Image
                    className="site-content-thumb"
                    src={`/api/staff/media/${slide.media_id}/file?w=480`}
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
                  onClick={() => setPickerFor(slide.id ?? null)}
                >
                  {t("chooseHomeSlideImage")}
                </button>
              </div>
              <div className="grid-2">
                {(["en", "am"] as const).map((locale) => (
                  <label className="field" key={locale}>
                    <span>{t(locale === "en" ? "englishCaption" : "amharicCaption")}</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={slide.translations[locale].caption}
                      onChange={(event) =>
                        updateSlide(slide.id!, {
                          translations: {
                            ...slide.translations,
                            [locale]: { caption: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="field">
                <span>{t("optionalSlideLink")}</span>
                <input
                  value={slide.link}
                  maxLength={1000}
                  onChange={(event) => updateSlide(slide.id!, { link: event.target.value })}
                />
              </label>
              <label className="site-content-toggle">
                <input
                  type="checkbox"
                  checked={slide.active}
                  onChange={(event) => {
                    const updated = { ...slide, active: event.target.checked };
                    updateSlide(slide.id!, { active: updated.active });
                    void saveSlide(updated);
                  }}
                />
                <span>{t("slideActive")}</span>
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void saveSlide(slide)}
                  disabled={saving}
                >
                  {t("saveChanges")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => void removeSlide(slide)}
                  disabled={saving}
                >
                  {t("delete")}
                </button>
              </div>
            </article>
          ))}
          {newSlide && (
            <article className="card site-content-card">
              <h2>{t("addHomeSlide")}</h2>
              <div className="site-content-image-row">
                {newSlide.media_id ? (
                  <Image
                    className="site-content-thumb"
                    src={`/api/staff/media/${newSlide.media_id}/file?w=480`}
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
                  {t("chooseHomeSlideImage")}
                </button>
              </div>
              <div className="grid-2">
                {(["en", "am"] as const).map((locale) => (
                  <label className="field" key={locale}>
                    <span>{t(locale === "en" ? "englishCaption" : "amharicCaption")}</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={newSlide.translations[locale].caption}
                      onChange={(event) =>
                        setNewSlide({
                          ...newSlide,
                          translations: {
                            ...newSlide.translations,
                            [locale]: { caption: event.target.value },
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="field">
                <span>{t("optionalSlideLink")}</span>
                <input
                  value={newSlide.link}
                  maxLength={1000}
                  onChange={(event) => setNewSlide({ ...newSlide, link: event.target.value })}
                />
              </label>
              <label className="site-content-toggle">
                <input
                  type="checkbox"
                  checked={newSlide.active}
                  onChange={(event) => setNewSlide({ ...newSlide, active: event.target.checked })}
                />
                <span>{t("slideActive")}</span>
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void saveSlide(newSlide)}
                  disabled={saving || !newSlide.media_id}
                >
                  {t("addHomeSlide")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setNewSlide(null)}
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
            ? newSlide?.media_id
            : (slides.find((slide) => slide.id === pickerFor)?.media_id ?? null)
        }
        slotHint={t("homeSlideSizeHint")}
        onClose={() => setPickerFor(null)}
        onSelect={(mediaID) => {
          if (pickerFor === "new")
            setNewSlide((current) => current && { ...current, media_id: mediaID });
          else if (typeof pickerFor === "number") updateSlide(pickerFor, { media_id: mediaID });
          setPickerFor(null);
        }}
      />
    </section>
  );
}
