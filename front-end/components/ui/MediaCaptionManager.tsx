"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/DashboardProviders";
import {
  apiFetch,
  type AboutImage,
  type AboutImageInput,
  type HomeSlide,
  type HomeSlideInput,
} from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import FormDialog from "@/components/ui/FormDialog";
import MediaCaptionFields from "@/components/ui/MediaCaptionFields";
import SubmitButton from "@/components/ui/SubmitButton";
import EmptyState from "@/components/ui/EmptyState";

type CaptionDraft = { caption: string };
type Locale = "en" | "am";
type ManagedItem = {
  id?: number;
  media_id: number | null;
  sort_order: number;
  link: string;
  active: boolean;
  translations: Record<Locale, CaptionDraft>;
};

function toManagedItem(item: HomeSlide | AboutImage): ManagedItem {
  return {
    id: item.id,
    media_id: item.media_id,
    sort_order: item.sort_order,
    link: "link" in item ? (item.link ?? "") : "",
    active: "active" in item ? item.active : true,
    translations: {
      en: { caption: item.translations?.en?.caption ?? "" },
      am: { caption: item.translations?.am?.caption ?? "" },
    },
  };
}

export default function MediaCaptionManager({ kind }: { kind: "about-images" | "home-slides" }) {
  const t = useTranslations("dashboard");
  const confirm = useConfirm();
  const { user } = useAuth();
  const isSlides = kind === "home-slides";
  const path = `/admin/${kind}`;
  const title = t(isSlides ? "homeSliderTitle" : "aboutImagesTitle");
  const [items, setItems] = useState<ManagedItem[]>([]);
  const [draft, setDraft] = useState<ManagedItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    setLoading(true);
    setError("");
    try {
      const response = isSlides
        ? await apiFetch<{ items: HomeSlide[] }>(path, {})
        : await apiFetch<{ items: AboutImage[] }>(path, {});
      setItems(response.items.map(toManagedItem));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("siteContentLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [isSlides, path, t, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setCreating(true);
    setFormDirty(false);
    setDraft({
      media_id: null,
      sort_order: items.length,
      link: "",
      active: true,
      translations: { en: { caption: "" }, am: { caption: "" } },
    });
  }

  function updateDraft(update: Partial<ManagedItem>) {
    setFormDirty(true);
    setDraft((current) => (current ? { ...current, ...update } : current));
  }

  async function save(item: ManagedItem | null = draft, closeAfterSave = true) {
    if (!item) return;
    if (!item.media_id) {
      setError(t(isSlides ? "homeSlideChooseImage" : "aboutImageChooseImage"));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const translations = item.translations;
      const payload: HomeSlideInput | AboutImageInput = isSlides
        ? {
            media_id: item.media_id,
            sort_order: item.sort_order,
            active: item.active,
            link: item.link,
            translations,
          }
        : {
            media_id: item.media_id,
            sort_order: item.sort_order,
            translations,
          };
      await apiFetch(item.id ? `${path}/${item.id}` : path, {
        method: item.id ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      if (closeAfterSave) {
        setDraft(null);
        setCreating(false);
      } else {
        setDraft(item);
      }
      setFormDirty(false);
      setNotice(t("siteContentSaved"));
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("siteContentSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: ManagedItem) {
    if (
      !item.id ||
      !(await confirm(t(isSlides ? "confirmDeleteSlide" : "confirmDeleteAboutImage"), t("delete")))
    ) {
      return;
    }
    setError("");
    setNotice("");
    try {
      await apiFetch(`${path}/${item.id}`, { method: "DELETE" });
      setDraft(null);
      setCreating(false);
      setFormDirty(false);
      setNotice(t("siteContentDeleted"));
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("siteContentSaveFailed"));
    }
  }

  async function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setSaving(true);
    setError("");
    try {
      for (const [order, item] of reordered.entries()) {
        if (!item.id) continue;
        const payload: HomeSlideInput | AboutImageInput = isSlides
          ? {
              media_id: item.media_id ?? 0,
              sort_order: order,
              active: item.active,
              link: item.link,
              translations: item.translations,
            }
          : {
              media_id: item.media_id ?? 0,
              sort_order: order,
              translations: item.translations,
            };
        await apiFetch(`${path}/${item.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      setItems(reordered.map((item, order) => ({ ...item, sort_order: order })));
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

  const numberLabel = (index: number) =>
    t(isSlides ? "homeSlideNumber" : "aboutImageNumber", { number: index + 1 });
  const imageLabel = t(isSlides ? "chooseHomeSlideImage" : "chooseAboutImage");
  const imageHint = t(isSlides ? "homeSlideSizeHint" : "aboutImageSizeHint");

  return (
    <section>
      <PageHeader
        eyebrow={t("siteContentEyebrow")}
        title={title}
        description={t(isSlides ? "homeSliderHelp" : "aboutImagesHelp")}
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={startCreate}
            disabled={Boolean(draft) || saving}
          >
            {t(isSlides ? "addHomeSlide" : "addAboutImage")}
          </button>
        }
      />
      {error && !draft && (
        <p className="status status-error dashboard-status" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="status status-success dashboard-status" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <EmptyState role="status">{t("loadingSiteContent")}</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>{t(isSlides ? "noHomeSlides" : "noAboutImages")}</EmptyState>
      ) : (
        <div className="site-content-list">
          {items.map((item, index) => (
            <article className="card site-content-card" key={item.id}>
              <div className="site-content-card-head">
                <h2>{numberLabel(index)}</h2>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => void move(index, -1)}
                    disabled={index === 0 || saving}
                  >
                    {t(isSlides ? "moveSlideUp" : "moveAboutImageUp")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => void move(index, 1)}
                    disabled={index === items.length - 1 || saving}
                  >
                    {t(isSlides ? "moveSlideDown" : "moveAboutImageDown")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-small"
                    onClick={() => {
                      setCreating(false);
                      setDraft(item);
                      setFormDirty(false);
                    }}
                  >
                    {t("edit")}
                  </button>
                </div>
              </div>
              {item.media_id ? (
                <Image
                  className="site-content-thumb"
                  src={`/api/staff/media/${item.media_id}/file?w=480`}
                  alt=""
                  width={480}
                  height={270}
                  unoptimized
                />
              ) : null}
              <p className="site-block-text">
                {item.translations.en.caption || item.translations.am.caption}
              </p>
            </article>
          ))}
        </div>
      )}
      <FormDialog
        open={draft !== null}
        title={t(creating ? (isSlides ? "addHomeSlide" : "addAboutImage") : "edit")}
        onClose={() => {
          setDraft(null);
          setCreating(false);
          setFormDirty(false);
        }}
        dirty={formDirty}
        discardTitle={t("confirmActionTitle")}
        discardMessage={t("discardFormChanges")}
        discardLabel={t("discardChanges")}
        cancelLabel={t("cancel")}
        closeLabel={t("closeDialog")}
        wide
      >
        {(requestClose) =>
          draft && (
            <article className="card site-content-card">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                {error && (
                  <p className="status status-error dashboard-status" role="alert">
                    {error}
                  </p>
                )}
                <fieldset className="site-content-editor-fields" disabled={saving}>
                  <MediaCaptionFields
                    id={`media-caption-${draft.id ?? "new"}`}
                    mediaID={draft.media_id}
                    captions={{
                      en: draft.translations.en.caption,
                      am: draft.translations.am.caption,
                    }}
                    imageHint={imageHint}
                    chooseImageLabel={imageLabel}
                    onMediaChange={(mediaID) => updateDraft({ media_id: mediaID })}
                    onCaptionChange={(locale, caption) =>
                      updateDraft({
                        translations: {
                          ...draft.translations,
                          [locale]: { caption },
                        },
                      })
                    }
                  />
                  {isSlides && (
                    <>
                      <label className="field">
                        <span>{t("optionalSlideLink")}</span>
                        <input
                          value={draft.link}
                          maxLength={1000}
                          onChange={(event) => updateDraft({ link: event.target.value })}
                        />
                      </label>
                      <label className="site-content-toggle">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(event) => {
                            const updated = { ...draft, active: event.target.checked };
                            setDraft(updated);
                            setFormDirty(true);
                            void save(updated, false);
                          }}
                        />
                        <span>{t("slideActive")}</span>
                      </label>
                    </>
                  )}
                </fieldset>
                <div className="form-actions">
                  <SubmitButton pending={saving} pendingLabel={t("saving")}>
                    {t(creating ? (isSlides ? "addHomeSlide" : "addAboutImage") : "saveChanges")}
                  </SubmitButton>
                  {draft.id && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={saving}
                      onClick={() => void remove(draft)}
                    >
                      {t("delete")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={requestClose}
                    disabled={saving}
                  >
                    {t("cancel")}
                  </button>
                </div>
              </form>
            </article>
          )
        }
      </FormDialog>
    </section>
  );
}
