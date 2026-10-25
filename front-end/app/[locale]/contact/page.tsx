import { getTranslations, setRequestLocale } from "next-intl/server";
import ContactForm from "@/components/ContactForm";
import { localizedMetadata } from "@/lib/metadata";

export const revalidate = 60;
type Props = { params: Promise<{ locale: "en" | "am" }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return localizedMetadata(locale, "/contact", `${t("contact")} | Kalen Benakafil`, t("contact"));
}
export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");
  return (
    <main id="main-content">
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">{t("eyebrow")}</span>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
      </section>
      <section className="section">
        <div className="container grid-2">
          <ContactForm />
          <div>
            <span className="eyebrow">{t("expect")}</span>
            <h2 className="display">{t("reply")}</h2>
            <p className="lede">{t("replyText")}</p>
            <div className="card card-accent">
              <h3>{t("email")}</h3>
              <p>{t("emailText")}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
