"use client";

import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState({
    users: 0,
    posts: 0,
    events: 0,
    media: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!token) return;

      try {
        const [users, posts, events, media] = await Promise.all([
          apiFetch("/admin/users", {}, token).catch(() => []),
          apiFetch("/admin/posts", {}, token).catch(() => []),
          apiFetch("/admin/events", {}, token).catch(() => []),
          apiFetch("/admin/media", {}, token).catch(() => []),
        ]);

        setStats({
          users: users?.length || 0,
          posts: posts?.length || 0,
          events: events?.length || 0,
          media: media?.length || 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [token]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Overview</h2>

      {loading ? (
        <p>Loading stats...</p>
      ) : (
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { title: "Users", value: stats.users },
            { title: "Posts", value: stats.posts },
            { title: "Events", value: stats.events },
            { title: "Media", value: stats.media },
          ].map((card) => (
            <div key={card.title} className="bg-white p-6 rounded shadow">
              <h3 className="text-gray-600">{card.title}</h3>
              <p className="text-3xl font-bold">{card.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
