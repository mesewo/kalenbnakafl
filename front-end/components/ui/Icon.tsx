import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "posts"
  | "events"
  | "media"
  | "messages"
  | "slider"
  | "gallery"
  | "branding"
  | "content"
  | "guide"
  | "users"
  | "volunteers"
  | "applications"
  | "profile"
  | "public"
  | "plus"
  | "arrow"
  | "calendar"
  | "inbox";

const paths: Record<IconName, string> = {
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  posts: "M5 4h14v16H5z M8 8h8M8 12h8M8 16h5",
  events: "M4 6h16v15H4z M8 3v6m8-6v6M4 10h16",
  media: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4M9 9h.01",
  messages: "M4 5h16v12H9l-5 4z M8 9h8m-8 4h5",
  slider: "M4 5h16v14H4z M8 9h8m-8 4h5",
  gallery: "M3 5h18v14H3z M3 15l5-5 4 4 3-3 6 6",
  branding: "M12 3v18m-9-9h18 M5.6 5.6l12.8 12.8m0-12.8L5.6 18.4",
  content: "M5 4h14v16H5z M8 8h8M8 12h8M8 16h6",
  guide: "M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22z M4 5.5v16.5",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-7a4 4 0 0 1 0 8m2 3a4 4 0 0 1 3 4v2",
  volunteers: "M12 21s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11Z",
  applications: "M6 3h12v18H6z M9 8h6m-6 4h6m-6 4h4",
  profile: "M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  public: "M3 11.5 12 4l9 7.5M5 10v10h14V10M9 20v-6h6v6",
  plus: "M12 5v14m-7-7h14",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  calendar: "M4 6h16v15H4z M8 3v6m8-6v6M4 10h16",
  inbox: "M4 4h16v16H4z M4 13h4l2 3h4l2-3h4",
};

export default function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
