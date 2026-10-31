"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/ui/PageHeader";

export default function AdminGuidePage() {
  const t = useTranslations("dashboard");
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <p className="status status-error" role="alert">
        {t("adminAccessRequired")}
      </p>
    );
  }
  const sections = [
    ["guideUploadTitle", "guideUploadText"],
    ["guideAltTitle", "guideAltText"],
    ["guideCoverTitle", "guideCoverText"],
    ["guideSliderTitle", "guideSliderText"],
    ["guidePageTextTitle", "guidePageTextText"],
    ["guideSizesTitle", "guideSizesText"],
    ["guideHelpTitle", "guideHelpText"],
  ] as const;
  return (
    <article>
      <PageHeader title={t("adminGuideTitle")} description={t("adminGuideIntro")} />
      <div className="grid-2">
        {sections.map(([title, text]) => (
          <section className="card" key={title}>
            <h2>{t(title)}</h2>
            <p className="site-block-text">{t(text)}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
