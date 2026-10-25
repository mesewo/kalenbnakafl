import { getTranslations, setRequestLocale } from "next-intl/server";
import RegisterForm from "@/components/RegisterForm";
import { localizedMetadata } from "@/lib/metadata";
type Props = { params: Promise<{ locale: "en" | "am" }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return localizedMetadata(
    locale,
    "/auth/register",
    `${t("register")} | Kalen Benakafil`,
    t("register"),
  );
}
export default async function RegisterPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main id="main-content">
      <RegisterForm />
    </main>
  );
}
