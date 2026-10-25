"use client";
import { useTranslations } from "next-intl";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  return (
    <main id="main-content" className="section">
      <div className="container empty-state">
        <h1>{t("generic")}</h1>
        <button className="btn btn-primary" onClick={reset}>
          {t("retry")}
        </button>
      </div>
    </main>
  );
}
