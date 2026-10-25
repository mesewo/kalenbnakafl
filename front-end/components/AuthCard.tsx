import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
export default function AuthCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <div className="auth-wrap">
      <div className="auth-card form-card">
        <span className="eyebrow">{eyebrow || t("communityAccess")}</span>
        <h1 className="display" style={{ fontSize: "clamp(2.4rem, 7vw, 4rem)" }}>
          {title}
        </h1>
        {children}
        <p className="meta" style={{ marginTop: "1.5rem" }}>
          <Link href="/">{t("back")}</Link>
        </p>
      </div>
    </div>
  );
}
