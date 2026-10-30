"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useState } from "react";

export default function Footer({
  logoUrl,
  siteName,
  tagline,
}: {
  logoUrl: string | null;
  siteName: string;
  tagline: string;
}) {
  const t = useTranslations("footer");
  const common = useTranslations("common");
  const [logoFailed, setLogoFailed] = useState(false);
  const effectiveLogoUrl = logoUrl && !logoFailed ? logoUrl : "/kalenbnakafl-logo.jpg";
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand">
            <Image
              className={
                effectiveLogoUrl !== "/kalenbnakafl-logo.jpg"
                  ? "brand-logo brand-logo-custom"
                  : "brand-logo"
              }
              src={effectiveLogoUrl}
              alt=""
              width={logoUrl ? 180 : 42}
              height={42}
              unoptimized
              onError={() => setLogoFailed(true)}
            />
            <span className="brand-copy">
              <strong>{siteName || common("brand")}</strong>
              <span>{tagline || common("community")}</span>
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
