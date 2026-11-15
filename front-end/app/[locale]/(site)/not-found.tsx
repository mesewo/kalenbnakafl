"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Icon from "@/components/ui/Icon";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <main id="main-content" className="state-screen">
      <span className="state-mark" aria-hidden="true">
        <Icon name="public" />
      </span>
      <h1>{t("notFoundTitle")}</h1>
      <p>{t("notFound")}</p>
      <Link className="btn btn-primary" href="/">
        {t("home")}
      </Link>
    </main>
  );
}
