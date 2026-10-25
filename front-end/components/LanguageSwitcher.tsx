"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const nextLocale = locale === "en" ? "am" : "en";
  const label = locale === "en" ? t("amharic") : t("english");

  return (
    <button
      type="button"
      className="btn btn-outline btn-small"
      onClick={() => router.replace(pathname, { locale: nextLocale })}
      aria-label={label}
    >
      {label}
    </button>
  );
}
