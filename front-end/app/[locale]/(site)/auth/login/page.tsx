import { getTranslations, setRequestLocale } from "next-intl/server";
import LoginForm from "@/components/LoginForm";
import { localizedMetadata } from "@/lib/metadata";
type Props = { params: Promise<{ locale: "en" | "am" }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return localizedMetadata(locale, "/auth/login", `${t("login")} | Kalen Benakafil`, t("login"));
}
export default async function LoginPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main id="main-content">
      <LoginForm />
    </main>
  );
}
