"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, type Post } from "@/lib/api";
import MediaPicker from "@/components/MediaPicker";
import FormDialog from "@/components/ui/FormDialog";
import type { components } from "@/types/api.d.ts";

type Locale = "en" | "am";
type Translation = components["schemas"]["PostTranslation"];
type CreatePostRequest = components["schemas"]["CreatePostRequest"];
type UpdatePostRequest = components["schemas"]["UpdatePostRequest"];
type Draft = Record<Locale, Translation>;
const emptyDraft: Draft = {
  en: { title: "", content: "" },
  am: { title: "", content: "" },
};

export default function PostModal({
  isOpen,
  onClose,
  onSuccess,
  post,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userRole: string | undefined;
  post?: Post | null;
}) {
  const t = useTranslations("dashboard");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [slug, setSlug] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [coverMediaID, setCoverMediaID] = useState<number | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [pickerPurpose, setPickerPurpose] = useState<"cover" | "inline">("cover");
  const [dirty, setDirty] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  useEffect(() => {
    setDraft({
      en: post?.translations?.en ?? emptyDraft.en,
      am: post?.translations?.am ?? emptyDraft.am,
    });
    setSlug(post?.slug || "");
    setLocale("en");
    setCoverMediaID(post?.cover_media_id ?? null);
    setMediaPickerOpen(false);
    setError("");
    setDirty(false);
  }, [post, isOpen]);
  if (!isOpen) return null;

  function change(field: keyof Translation, value: string) {
    setDirty(true);
    setDraft((current) => ({ ...current, [locale]: { ...current[locale], [field]: value } }));
  }

  function translationsToSave(): Partial<Record<Locale, Translation>> | null {
    const result: Partial<Record<Locale, Translation>> = {};
    for (const language of ["en", "am"] as const) {
      const value = draft[language];
      const title = value.title.trim();
      const content = value.content.trim();
      if (!title && !content) continue;
      if (!title || !content) {
        setError(
          t("translationIncomplete", { language: language === "en" ? t("english") : t("amharic") }),
        );
        return null;
      }
      result[language] = { title, content };
    }
    if (!Object.keys(result).length) {
      setError(t("translationRequired"));
      return null;
    }
    return result;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const values = translationsToSave();
    if (!values) return;
    setLoading(true);
    try {
      const cleanSlug = slug.trim();
      if (!post) {
        const body: CreatePostRequest = {
          translations: values,
          ...(cleanSlug ? { slug: cleanSlug } : {}),
          ...(coverMediaID !== null ? { cover_media_id: coverMediaID } : {}),
        };
        await apiFetch("/staff/posts", { method: "POST", body: JSON.stringify(body) });
      } else {
        const original = post.translations ?? {};
        const operations: { language: Locale; value: Translation | null }[] = [];
        for (const language of ["en", "am"] as const) {
          const next = values[language] ?? null;
          const previous = original[language];
          if (JSON.stringify(next) !== JSON.stringify(previous ?? null)) {
            operations.push({ language, value: next });
          }
        }
        const slugChanged = cleanSlug !== post.slug;
        const coverChanged = (post.cover_media_id ?? null) !== coverMediaID;
        if (!operations.length && (slugChanged || coverChanged)) {
          const language = original.en ? "en" : "am";
          operations.push({ language, value: original[language] ?? null });
        }
        // Add or replace translations before removals so the server's at-least-one rule holds.
        operations.sort((a, b) => Number(a.value === null) - Number(b.value === null));
        for (const [index, operation] of operations.entries()) {
          const translations: UpdatePostRequest["translations"] = {
            [operation.language]: operation.value,
          };
          const body: UpdatePostRequest = {
            translations,
            ...(index === 0 && slugChanged && cleanSlug ? { slug: cleanSlug } : {}),
            ...(index === 0 && coverMediaID !== null ? { cover_media_id: coverMediaID } : {}),
            ...(index === 0 && coverMediaID === null && post.cover_media_id
              ? { clear_cover_media: true }
              : {}),
          };
          await apiFetch(`/staff/posts/${post.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        }
      }
      setDirty(false);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("savePostFailed"));
    } finally {
      setLoading(false);
    }
  }

  function insertInlineImage(mediaID: number) {
    const content = draft[locale].content;
    const { start, end } = selectionRef.current;
    const token = `{{media:${mediaID}}}`;
    const before = content.slice(0, start);
    const after = content.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    const nextContent = `${before}${prefix}${token}${suffix}${after}`;
    change("content", nextContent);
    const cursor = before.length + prefix.length + token.length + suffix.length;
    requestAnimationFrame(() => {
      contentRef.current?.focus();
      contentRef.current?.setSelectionRange(cursor, cursor);
      selectionRef.current = { start: cursor, end: cursor };
    });
  }

  return (
    <FormDialog
      open={isOpen}
      title={post ? t("editPost") : t("createPost")}
      onClose={onClose}
      dirty={dirty}
      discardTitle={t("confirmActionTitle")}
      discardMessage={t("discardFormChanges")}
      discardLabel={t("discardChanges")}
      cancelLabel={t("cancel")}
      closeLabel={t("closeDialog")}
      wide
    >
      {(requestClose) => (
        <>
          {error && (
            <div className="status status-error dashboard-status" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={submit}>
            <div role="tablist" aria-label={t("postLanguage")}>
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
            <div className="field">
              <label htmlFor="post-title">
                {t("title")} {"("}
                {locale === "en" ? t("english") : t("amharic")}
                {")"}
              </label>
              <input
                id="post-title"
                value={draft[locale].title}
                maxLength={180}
                onChange={(e) => change("title", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="post-slug">{t("slug")}</label>
              <input
                id="post-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setDirty(true);
                }}
                placeholder={t("slugPlaceholder")}
                pattern="[a-z0-9-]{3,100}"
                title={t("slugValidation")}
              />
            </div>
            <div className="field">
              <p className="field-label">{t("postCover")}</p>
              {coverMediaID !== null ? (
                <div className="cover-preview">
                  <Image
                    src={`/api/staff/media/${coverMediaID}/file?w=960`}
                    alt=""
                    width={960}
                    height={540}
                    sizes="(max-width: 560px) 100vw, 520px"
                    unoptimized
                  />
                  <button
                    className="btn btn-outline btn-small"
                    type="button"
                    onClick={() => {
                      setCoverMediaID(null);
                      setDirty(true);
                    }}
                  >
                    {t("removeCover")}
                  </button>
                </div>
              ) : (
                <div className="cover-placeholder" aria-hidden="true" />
              )}
              <p className="meta">{t("postCoverHint")}</p>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => {
                  setPickerPurpose("cover");
                  setMediaPickerOpen(true);
                }}
              >
                {coverMediaID === null ? t("selectCover") : t("changeCover")}
              </button>
            </div>
            <div className="field">
              <label htmlFor="post-content">
                {t("postContent")} {"("}
                {locale === "en" ? t("english") : t("amharic")}
                {")"}
              </label>
              <textarea
                ref={contentRef}
                id="post-content"
                value={draft[locale].content}
                maxLength={20000}
                onSelect={(event) => {
                  selectionRef.current = {
                    start: event.currentTarget.selectionStart,
                    end: event.currentTarget.selectionEnd,
                  };
                }}
                onChange={(e) => change("content", e.target.value)}
              />
              <button
                className="btn btn-outline btn-small"
                type="button"
                onClick={() => {
                  const content = draft[locale].content;
                  selectionRef.current = contentRef.current
                    ? {
                        start: contentRef.current.selectionStart,
                        end: contentRef.current.selectionEnd,
                      }
                    : { start: content.length, end: content.length };
                  setPickerPurpose("inline");
                  setMediaPickerOpen(true);
                }}
              >
                {t("insertImage")}
              </button>
            </div>
            <p className="meta">{t("clearPostTranslationHelp")}</p>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={loading}>
                {loading ? t("saving") : post ? t("saveChanges") : t("createPost")}
              </button>
              <button className="btn btn-outline" type="button" onClick={requestClose}>
                {t("cancel")}
              </button>
            </div>
          </form>
          <MediaPicker
            isOpen={mediaPickerOpen}
            selectedMediaID={pickerPurpose === "cover" ? coverMediaID : null}
            slotHint={t("postCoverHint")}
            onClose={() => setMediaPickerOpen(false)}
            onSelect={(mediaID) => {
              if (pickerPurpose === "inline") {
                insertInlineImage(mediaID);
              } else {
                setCoverMediaID(mediaID);
                setDirty(true);
              }
              setMediaPickerOpen(false);
            }}
          />
        </>
      )}
    </FormDialog>
  );
}
