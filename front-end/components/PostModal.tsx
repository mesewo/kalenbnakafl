"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch, type Post } from "@/lib/api";

export default function PostModal({
  isOpen,
  onClose,
  onSuccess,
  userRole,
  post,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userRole: string | undefined;
  post?: Post | null;
}) {
  const [form, setForm] = useState({ title: "", content: "", slug: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setForm({ title: post?.title || "", content: post?.content || "", slug: post?.slug || "" });
    setError("");
  }, [post, isOpen]);
  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);
  if (!isOpen) return null;
  const prefix = "/staff";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.title.trim() || !form.content.trim()) {
      setError("Title and content are required.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(post ? `${prefix}/posts/${post.id}` : `${prefix}/posts`, {
        method: post ? "PATCH" : "POST",
        body: JSON.stringify({ ...form, slug: form.slug.trim() }),
      });
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
          <div className="field">
            <label htmlFor="post-title">Title</label>
            <input
              id="post-title"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="post-slug">Slug</label>
            <input
              id="post-slug"
              value={form.slug}
              onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
              placeholder="Generated from title when blank"
              pattern="[a-z0-9-]{3,100}"
              title="Use 3 to 100 lowercase letters, numbers, or hyphens."
            />
          </div>
          <div className="field">
            <label htmlFor="post-content">Content</label>
            <textarea
              id="post-content"
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              required
            />
          </div>
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
