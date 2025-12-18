"use client";

import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const { token, user } = useAuth();
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
        if (user?.role === "admin") {
          // Admins fetch from /admin routes
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
        } else if (user?.role === "editor") {
          // Editors fetch from /editor routes
          const [posts, events, media] = await Promise.all([
            apiFetch("/editor/posts", {}, token).catch(() => []),
            apiFetch("/editor/events", {}, token).catch(() => []),
            apiFetch("/editor/media", {}, token).catch(() => []),
          ]);

          setStats({
            users: 0,
            posts: posts?.length || 0,
            events: events?.length || 0,
            media: media?.length || 0,
          });
        } else {
          // Regular users and volunteers see public endpoints
          const [posts, events] = await Promise.all([
            apiFetch("/posts", {}, token).catch(() => []),
            apiFetch("/events", {}, token).catch(() => []),
          ]);

          setStats({
            users: 0,
            posts: posts?.length || 0,
            events: events?.length || 0,
            media: 0,
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [token, user?.role]);

  const getRoleMessage = () => {
    switch (user?.role) {
      case "admin":
        return "Admin Dashboard - Full System Access";
      case "editor":
        return "Editor Dashboard - Content Management";
      case "volunteer":
        return "Volunteer Dashboard - Event Participation";
      default:
        return "User Dashboard";
    }
  };

  const getStatsForRole = () => {
    const allStats = [
      { title: "Users", value: stats.users, page: "/dashboard/users" },
      { title: "Posts", value: stats.posts, page: "/dashboard/posts" },
      { title: "Events", value: stats.events, page: "/dashboard/events" },
      { title: "Media", value: stats.media, page: "/dashboard/media" },
    ];

    // Show different stats based on role
    if (user?.role === "admin") {
      return allStats;
    } else if (user?.role === "editor") {
      // Editors see everything except Users
      return allStats.filter((stat) => stat.title !== "Users");
    } else {
      // Volunteers and users see only Posts and Events (non-clickable)
      return allStats.filter(
        (stat) => stat.title === "Posts" || stat.title === "Events"
      );
    }
  };

  const getCardContent = (card: any) => {
    // Determine if card should be clickable
    const isAdmin = user?.role === "admin";
    const isEditor = user?.role === "editor";
    const isClickable = isAdmin || isEditor;

    const cardElement = (
      <div className={`bg-white p-6 rounded shadow ${isClickable ? "hover:shadow-lg transition-shadow cursor-pointer" : ""}`}>
        <h3 className="text-gray-600">{card.title}</h3>
        <p className="text-3xl font-bold">{card.value}</p>
      </div>
    );

    // Make cards clickable for both admins and editors
    if (isClickable) {
      return (
        <Link key={card.title} href={card.page}>
          {cardElement}
        </Link>
      );
    }

    return <div key={card.title}>{cardElement}</div>;
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">
          Welcome, {user?.name || "User"}!
        </h2>
        <p className="text-lg text-gray-600">{getRoleMessage()}</p>
      </div>

      {user?.role === "admin" && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
          <p className="text-blue-700 font-semibold">
            You have full administrative access to manage users, content, events,
            and media.
          </p>
        </div>
      )}

      {user?.role === "editor" && (
        <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
          <p className="text-green-700 font-semibold">
            You can create and manage posts and events for the community.
          </p>
        </div>
      )}

      {user?.role === "volunteer" && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6">
          <p className="text-yellow-700 font-semibold">
            Thank you for volunteering! Browse upcoming events and join us!
          </p>
        </div>
      )}

      <h3 className="text-2xl font-bold mb-6">Overview</h3>

      {loading ? (
        <p>Loading stats...</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {getStatsForRole().map((card) => getCardContent(card))}
        </div>
      )}
    </div>
  );
}
