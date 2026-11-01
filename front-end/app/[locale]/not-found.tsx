import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/Icon";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="state-screen" id="main-content">
      <span className="state-mark" aria-hidden="true">
        <Icon name="public" />
      </span>
      <h1>{t("notFoundTitle")}</h1>
      <p>{t("notFound")}</p>
      <Link href="/" className="btn btn-primary">
        {t("home")}
      </Link>
    </main>
  );
}
