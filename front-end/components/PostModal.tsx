"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string | null;
  userRole: string | undefined;
}

export default function PostModal({
  isOpen,
  onClose,
  onSuccess,
  token,
  userRole,
}: PostModalProps) {
  const [formData, setFormData] = useState({
    title: "",
    content: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const endpoint =
        userRole === "admin" ? "/admin/posts" : "/editor/posts";
      await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(formData),
        headers: {
          "Content-Type": "application/json",
        },
      }, token);

      setFormData({ title: "", content: "" });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Create New Post</h2>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="Post title"
              className="w-full border p-2 rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Content</label>
            <textarea
              name="content"
              value={formData.content}
              onChange={handleChange}
              required
              placeholder="Post content"
              rows={6}
              className="w-full border p-2 rounded"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Post"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-300 px-4 py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
