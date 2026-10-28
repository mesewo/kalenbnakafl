"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <main id="main-content" className="section">
      <div className="container empty-state">
        <h1>{t("notFoundTitle")}</h1>
        <p>{t("notFound")}</p>
        <Link className="btn btn-primary" href="/">
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
