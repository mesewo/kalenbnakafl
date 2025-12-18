"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { apiFetch } from "@/lib/api";

export default function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        setLoading(true);
        const data = await apiFetch("/posts");
        setPosts(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load posts");
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, []);

  return (
    <>
      <Navbar />

      <section className="bg-primary py-16 text-center">
        <h1 className="text-4xl font-bold">News & Updates</h1>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16">
        {loading ? (
          <p className="text-center">Loading posts...</p>
        ) : error ? (
          <p className="text-center text-red-600">{error}</p>
        ) : posts && posts.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-8">
            {posts.map((post: any) => (
              <div key={post.id} className="border rounded-lg p-6 shadow">
                <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
                <p>{post.content || post.summary}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center">No posts available.</p>
        )}
      </section>

      <Footer />
    </>
  );
}
