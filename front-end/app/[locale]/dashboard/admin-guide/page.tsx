"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";

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
      <header className="dashboard-title">
        <div>
          <h1>{t("adminGuideTitle")}</h1>
          <p>{t("adminGuideIntro")}</p>
        </div>
      </header>
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
