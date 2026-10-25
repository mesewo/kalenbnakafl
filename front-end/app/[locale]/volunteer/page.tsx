import { getTranslations, setRequestLocale } from "next-intl/server";
import VolunteerClient from "@/components/VolunteerClient";
import { localizedMetadata } from "@/lib/metadata";

export const revalidate = 60;
type Props = { params: Promise<{ locale: "en" | "am" }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return localizedMetadata(
    locale,
    "/volunteer",
    `${t("volunteer")} | Kalen Benakafil`,
    t("volunteer"),
  );
}
export default async function VolunteerPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <VolunteerClient />;
}
