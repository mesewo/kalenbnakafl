"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  apiFetch,
  type EventItem,
  type MediaItem,
  type PageResponse,
  type Post,
  type User,
} from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";

export default function DashboardPage() {
  const { user } = useAuth();
  const t = useTranslations("dashboard");
  const [stats, setStats] = useState({ users: 0, posts: 0, events: 0, media: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    const prefix = user.role === "admin" || user.role === "editor" ? "/staff" : "";
    Promise.all([
      apiFetch<PageResponse<Post>>(`${prefix}/posts?limit=1`, {}).catch(() => ({
        items: [],
        page: 1,
        limit: 1,
        total: 0,
      })),
      apiFetch<PageResponse<EventItem>>(`${prefix}/events?limit=1`, {}).catch(() => ({
        items: [],
        page: 1,
        limit: 1,
        total: 0,
      })),
      apiFetch<PageResponse<MediaItem>>(`${prefix}/media?limit=1`, {}).catch(() => ({
        items: [],
        page: 1,
        limit: 1,
        total: 0,
      })),
      user.role === "admin"
        ? apiFetch<User[]>("/admin/users", {}).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([posts, events, media, users]) =>
        setStats({
          posts: posts.total,
          events: events.total,
          media: media.total,
          users: users.length,
        }),
      )
      .finally(() => setLoading(false));
  }, [user]);
  const admin = user?.role === "admin";
  const editor = user?.role === "editor";
  const cards = [
    ...(admin ? [{ label: t("people"), value: stats.users, href: "/dashboard/users" }] : []),
    ...(admin || editor
      ? [
          { label: t("posts"), value: stats.posts, href: "/dashboard/posts" },
          { label: t("events"), value: stats.events, href: "/dashboard/events" },
          { label: t("media"), value: stats.media, href: "/dashboard/media" },
        ]
      : []),
  ];
  const headline = admin ? t("adminHeadline") : editor ? t("editorHeadline") : t("memberHeadline");
  const description = admin
    ? t("adminDescription")
    : editor
      ? t("editorDescription")
      : t("memberDescription");
  return (
    <div>
      <PageHeader
        eyebrow={t("homeEyebrow")}
        title={t("greeting", { name: user?.name?.split(" ")[0] || "" })}
      />
      <div className="card card-accent dashboard-intro-card">
        <h2>{headline}</h2>
        <p>{description}</p>
      </div>
      <div className="grid-3">
        {loading ? (
          <div className="empty-state">{t("loading")}</div>
        ) : cards.length ? (
          cards.map((card) => (
            <Link className="card" href={card.href} key={card.label}>
              <span className="meta">{card.label}</span>
              <strong className="dashboard-stat-value">{card.value}</strong>
              <span className="meta">{t("open", { label: card.label.toLowerCase() })}</span>
            </Link>
          ))
        ) : (
          <div className="empty-state">{t("ready")}</div>
        )}
      </div>
    </div>
  );
}
