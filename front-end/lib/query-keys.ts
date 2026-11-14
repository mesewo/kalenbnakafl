export const queryKeys = {
  users: ["users"] as const,
  posts: ["posts"] as const,
  events: ["events"] as const,
  media: ["media"] as const,
  slides: ["home-slides"] as const,
  settings: ["site-settings"] as const,
  blocks: ["site-blocks"] as const,
  aboutImages: ["about-images"] as const,
  contactMessages: (page?: number, status?: string) =>
    page === undefined && status === undefined
      ? (["contact-messages"] as const)
      : (["contact-messages", { page, status }] as const),
  volunteers: ["volunteers"] as const,
  volunteerApplications: (page?: number, status?: string) =>
    page === undefined && status === undefined
      ? (["volunteer-applications"] as const)
      : (["volunteer-applications", { page, status }] as const),
  dashboardOverview: (role: string) => ["dashboard-overview", role] as const,
};
