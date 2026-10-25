import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
export default async function NotFound() {
  const t = await getTranslations("errors");
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
