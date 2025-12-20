"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import PostModal from "@/components/PostModal";

export default function PostsAdminPage() {
  const { token, user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      // Use role-specific endpoint
      const endpoint = user?.role === "admin" ? "/admin/posts" : "/editor/posts";
      const data = await apiFetch(endpoint, {}, token);
      setPosts(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchPosts();
    }
  }, [token, user?.role]);

  if (loading) return <div>Loading posts...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Manage Posts</h2>
      <button
        onClick={() => setIsModalOpen(true)}
        className="bg-primaryDark text-white px-4 py-2 rounded mb-4 hover:opacity-90"
      >
        Add Post
      </button>

      <PostModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchPosts}
        token={token}
        userRole={user?.role}
      />

      {error && <div className="text-red-600 mb-4">{error}</div>}

      <div className="bg-white p-4 rounded shadow">
        {posts && posts.length > 0 ? (
          <div>
            {posts.map((post: any) => (
              <div key={post.id} className="border-b pb-4 mb-4">
                <h3 className="font-bold">{post.title}</h3>
                <p>{post.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No posts yet.</p>
        )}
      </div>
    </div>
  );
}
