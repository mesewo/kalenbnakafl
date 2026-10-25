"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, type Post } from "@/lib/api";
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
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [slug, setSlug] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setDraft({
      en: post?.translations?.en ?? emptyDraft.en,
      am: post?.translations?.am ?? emptyDraft.am,
    });
    setSlug(post?.slug || "");
    setLocale("en");
    setError("");
  }, [post, isOpen]);
  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);
  if (!isOpen) return null;

  function change(field: keyof Translation, value: string) {
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
          `Complete both title and content for ${language === "en" ? "English" : "አማርኛ"}, or clear both fields.`,
        );
        return null;
      }
      result[language] = { title, content };
    }
    if (!Object.keys(result).length) {
      setError("At least one complete language is required.");
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
        if (!operations.length && slugChanged) {
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
          };
          await apiFetch(`/staff/posts/${post.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        }
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the post.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="post-modal-title">
        <div className="modal-head">
          <h2 id="post-modal-title">{post ? "Edit post" : "Create a post"}</h2>
          <button
            className="close-btn"
            ref={closeRef}
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {error && (
          <div className="status status-error" role="alert" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <div role="tablist" aria-label="Post language">
            <button
              type="button"
              role="tab"
              aria-selected={locale === "en"}
              onClick={() => setLocale("en")}
            >
              English
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={locale === "am"}
              onClick={() => setLocale("am")}
            >
              አማርኛ
            </button>
          </div>
          <div className="field">
            <label htmlFor="post-title">Title ({locale === "en" ? "English" : "አማርኛ"})</label>
            <input
              id="post-title"
              value={draft[locale].title}
              maxLength={180}
              onChange={(e) => change("title", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="post-slug">Slug</label>
            <input
              id="post-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="Generated from title when blank"
              pattern="[a-z0-9-]{3,100}"
              title="Use 3 to 100 lowercase letters, numbers, or hyphens."
            />
          </div>
          <div className="field">
            <label htmlFor="post-content">Content ({locale === "en" ? "English" : "አማርኛ"})</label>
            <textarea
              id="post-content"
              value={draft[locale].content}
              maxLength={20000}
              onChange={(e) => change("content", e.target.value)}
            />
          </div>
          <p className="meta">
            Clear both fields for a language to remove it. At least one language must remain.
          </p>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "Saving…" : post ? "Save changes" : "Create post"}
            </button>
            <button className="btn btn-outline" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
