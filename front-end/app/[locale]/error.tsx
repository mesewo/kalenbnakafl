"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";

export default function LocaleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  return (
    <main className="state-screen" id="main-content">
      <span className="state-mark" aria-hidden="true">
        <Icon name="guide" />
      </span>
      <h1>{t("generic")}</h1>
      <p>{t("errorDescription")}</p>
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={reset}>
          {t("retry")}
        </button>
        <Link href="/" className="btn btn-outline">
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
