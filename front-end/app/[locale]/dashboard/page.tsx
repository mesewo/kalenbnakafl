"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import Icon, { type IconName } from "@/components/ui/Icon";
import PageHeader from "@/components/ui/PageHeader";
import {
  apiFetch,
  excerpt,
  formatDate,
  formatNumber,
  type EventItem,
  type PageResponse,
  type Post,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

type DashboardMessage = { id: number; name: string; created_at: string };
type DashboardApplication = { id: number; name: string; created_at: string };
type Activity = {
  id: string;
  title: string;
  summary: string;
  date?: string;
  label: string;
  href: string;
  icon: IconName;
};
type OverviewData = {
  posts: PageResponse<Post>;
  events: PageResponse<EventItem>;
  messages: PageResponse<DashboardMessage> | null;
  applications: PageResponse<DashboardApplication> | null;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const common = useTranslations("common");
  const errors = useTranslations("errors");
  const admin = user?.role === "admin";
  const content = admin || user?.role === "editor";
  const overviewQuery = useQuery({
    queryKey: queryKeys.dashboardOverview(user?.role ?? "guest"),
    enabled: Boolean(user),
    queryFn: async (): Promise<OverviewData> => {
      const prefix = content ? "/staff" : "";
      const [posts, events, messages, applications] = await Promise.all([
        apiFetch<PageResponse<Post>>(`${prefix}/posts?limit=3`, {}),
        apiFetch<PageResponse<EventItem>>(`${prefix}/events?upcoming=true&limit=3`, {}),
        content
          ? apiFetch<PageResponse<DashboardMessage>>(
              "/staff/contact-messages?status=new&limit=3",
              {},
            )
          : Promise.resolve(null),
        admin
          ? apiFetch<PageResponse<DashboardApplication>>(
              "/admin/volunteer-applications?status=pending&limit=3",
              {},
            )
          : Promise.resolve(null),
      ]);
      return { posts, events, messages, applications };
    },
  });
  const data = overviewQuery.data;
  const headline = admin
    ? t("adminHeadline")
    : user?.role === "editor"
      ? t("editorHeadline")
      : t("memberHeadline");
  const description = admin
    ? t("adminDescription")
    : user?.role === "editor"
      ? t("editorDescription")
      : t("memberDescription");

  const stats = [
    ...(content
      ? [
          {
            label: t("posts"),
            value: data?.posts.total,
            href: "/dashboard/posts",
            icon: "posts" as const,
          },
          {
            label: t("upcomingEvents"),
            value: data?.events.total,
            href: "/dashboard/events",
            icon: "events" as const,
          },
          {
            label: t("newMessages"),
            value: data?.messages?.total,
            href: "/dashboard/messages",
            icon: "messages" as const,
          },
        ]
      : []),
    ...(admin
      ? [
          {
            label: t("pendingApplications"),
            value: data?.applications?.total,
            href: "/dashboard/volunteer-applications",
            icon: "applications" as const,
          },
        ]
      : []),
  ];

  const activity: Activity[] = [
    ...(data?.posts.items.map((post) => ({
      id: `post-${post.id}`,
      title: post.title,
      summary: excerpt(post.content, 105),
      date: post.published_at || post.created_at,
      label: t("posts"),
      href: `/blog/${post.slug}`,
      icon: "posts" as const,
    })) ?? []),
    ...(data?.events.items.map((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      summary: event.location || excerpt(event.description, 105),
      date: event.created_at,
      label: t("events"),
      href: `/events/${event.id}`,
      icon: "events" as const,
    })) ?? []),
    ...(data?.messages?.items.map((message) => ({
      id: `message-${message.id}`,
      title: message.name,
      summary: t("newMessages"),
      date: message.created_at,
      label: t("messages"),
      href: "/dashboard/messages",
      icon: "messages" as const,
    })) ?? []),
    ...(data?.applications?.items.map((application) => ({
      id: `application-${application.id}`,
      title: application.name,
      summary: t("pendingApplications"),
      date: application.created_at,
      label: t("applications"),
      href: "/dashboard/volunteer-applications",
      icon: "applications" as const,
    })) ?? []),
  ]
    .sort((left, right) => new Date(right.date ?? 0).getTime() - new Date(left.date ?? 0).getTime())
    .slice(0, 6);

  const quickActions = content
    ? [
        { label: t("newPost"), href: "/dashboard/posts", icon: "posts" as const },
        { label: t("newEvent"), href: "/dashboard/events", icon: "events" as const },
        { label: t("mediaAddImages"), href: "/dashboard/media", icon: "media" as const },
        { label: t("inbox"), href: "/dashboard/messages", icon: "inbox" as const },
      ]
    : [
        { label: common("events"), href: "/events", icon: "events" as const },
        { label: common("news"), href: "/blog", icon: "posts" as const },
        { label: t("profile"), href: "/dashboard/profile", icon: "profile" as const },
      ];

  return (
    <div className="dashboard-overview">
      <PageHeader
        eyebrow={t("homeEyebrow")}
        title={t("greeting", { name: user?.name?.split(" ")[0] || "" })}
      />
      <div className="card dashboard-intro-card">
        <div>
          <span className="eyebrow">{common("brand")}</span>
          <h2>{headline}</h2>
          <p>{description}</p>
        </div>
        <span className="dashboard-intro-mark" aria-hidden="true">
          <Icon name="branding" />
        </span>
      </div>
      {overviewQuery.isError && (
        <div className="status status-error dashboard-status" role="alert">
          {overviewQuery.error instanceof Error ? overviewQuery.error.message : common("error")}
          <button type="button" className="text-link" onClick={() => void overviewQuery.refetch()}>
            {errors("retry")}
          </button>
        </div>
      )}
      {stats.length > 0 && (
        <section className="dashboard-overview-section" aria-label={t("overview")}>
          <div className="dashboard-metrics-grid">
            {stats.map((stat) => (
              <Link className="card dashboard-metric-card" href={stat.href} key={stat.label}>
                <span className="dashboard-metric-icon">
                  <Icon name={stat.icon} />
                </span>
                <span className="dashboard-metric-label">{stat.label}</span>
                {overviewQuery.isPending ? (
                  <span className="dashboard-stat-skeleton" aria-hidden="true" />
                ) : (
                  <strong className="dashboard-stat-value">
                    {formatNumber(stat.value ?? 0, locale)}
                  </strong>
                )}
                <span className="dashboard-metric-link">{t("open", { label: stat.label })}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="dashboard-overview-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="eyebrow">{t("homeEyebrow")}</span>
            <h2>{t("quickActions")}</h2>
          </div>
        </div>
        <div className="dashboard-quick-actions">
          {quickActions.map((action) => (
            <Link className="dashboard-quick-action" href={action.href} key={action.href}>
              <span className="dashboard-quick-icon">
                <Icon name={action.icon} />
              </span>
              <span>{action.label}</span>
              <Icon name="arrow" className="dashboard-quick-arrow" />
            </Link>
          ))}
        </div>
      </section>
      <section className="dashboard-overview-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="eyebrow">{common("community")}</span>
            <h2>{t("recentActivity")}</h2>
          </div>
        </div>
        {overviewQuery.isPending ? (
          <div className="dashboard-activity-list" role="status" aria-busy="true">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="dashboard-activity-skeleton" key={index} />
            ))}
            <span className="visually-hidden">{t("loading")}</span>
          </div>
        ) : activity.length > 0 ? (
          <ol className="dashboard-activity-list">
            {activity.map((item) => (
              <li className="dashboard-activity-item" key={item.id}>
                <span className="dashboard-activity-icon">
                  <Icon name={item.icon} />
                </span>
                <div className="dashboard-activity-copy">
                  <span className="meta">{item.label}</span>
                  <h3>{item.title}</h3>
                  {item.summary && <p>{item.summary}</p>}
                </div>
                {item.date && (
                  <time dateTime={item.date} className="meta">
                    {formatDate(item.date, false, locale)}
                  </time>
                )}
                <Link
                  className="dashboard-activity-link"
                  href={item.href}
                  aria-label={t("open", { label: item.title })}
                >
                  <Icon name="arrow" />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state dashboard-activity-empty">
            <p>{t("noRecentActivity")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
