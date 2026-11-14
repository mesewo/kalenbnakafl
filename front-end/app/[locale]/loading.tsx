import { useTranslations } from "next-intl";

export default function LocaleLoading() {
  const t = useTranslations("common");
  return (
    <main className="state-screen" id="main-content" role="status" aria-busy="true">
      <span className="loading-mark" aria-hidden="true" />
      <p>{t("loading")}</p>
    </main>
  );
}
