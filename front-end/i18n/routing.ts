import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "am"],
  defaultLocale: "en",
  localePrefix: "always",
  localeCookie: { name: "lang", maxAge: 60 * 60 * 24 * 365 },
});
