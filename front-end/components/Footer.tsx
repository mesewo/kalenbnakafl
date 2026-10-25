import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function Footer() {
  const t = useTranslations("footer");
  const common = useTranslations("common");
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand">
            <Image src="/kalenbnakafl-logo.jpg" alt="" width={42} height={42} />
            <span className="brand-copy">
              <strong>{common("brand")}</strong>
              <span>{common("community")}</span>
            </span>
          </div>
          <p className="lede">{t("description")}</p>
        </div>
        <div>
          <h3>{t("explore")}</h3>
          <div className="footer-links">
            <Link href="/about">{t("story")}</Link>
            <Link href="/events">{t("upcoming")}</Link>
            <Link href="/blog">{t("news")}</Link>
            <Link href="/volunteer">{common("volunteer")}</Link>
          </div>
        </div>
        <div>
          <h3>{t("connect")}</h3>
          <div className="footer-links">
            <Link href="/contact">{t("send")}</Link>
            <a href="mailto:hello@kalenbnakafl.org">{t("email")}</a>
            <span>{t("respond")}</span>
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>{common("copyright", { year: new Date().getFullYear() })}</span>
        <span>{common("footer")}</span>
      </div>
    </footer>
  );
}
