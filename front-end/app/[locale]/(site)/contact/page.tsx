import { getTranslations, setRequestLocale } from "next-intl/server";
import ContactForm from "@/components/ContactForm";
import { localizedMetadata } from "@/lib/metadata";
import { fetchOptionalSiteContent } from "@/lib/site-content";
import type { SiteBlock } from "@/lib/api";
import { getSiteBlockText } from "@/lib/site-block-catalog";

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
  const content = await fetchOptionalSiteContent<{ items: SiteBlock[] }>(
    "/site/blocks?page=contact",
    locale,
  );
  const block = (key: string, defaultKey: string) =>
    getSiteBlockText(content?.items, key, t(defaultKey));
  const emailAddress = getSiteBlockText(content?.items, "email_address", t("emailAddress"));
  const address = getSiteBlockText(content?.items, "address", "");
  const officeHours = getSiteBlockText(content?.items, "office_hours", "");
  const phone = getSiteBlockText(content?.items, "phone", "");
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress);
  const validPhone = /^\+?[0-9][0-9 .()\-]{5,24}$/.test(phone);
  return (
    <main id="main-content">
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">{block("hero_eyebrow", "eyebrow")}</span>
          <h1>{block("hero_title", "title")}</h1>
          <p className="site-block-text">{block("hero_intro", "intro")}</p>
        </div>
      </section>
      <section className="section">
        <div className="container grid-2">
          <ContactForm
            eyebrow={block("form_eyebrow", "say")}
            title={block("form_title", "formTitle")}
            helpText={block("form_help", "help")}
          />
          <div>
            <span className="eyebrow site-block-text">{block("expect_eyebrow", "expect")}</span>
            <h2 className="display site-block-text">{block("reply_title", "reply")}</h2>
            <p className="lede site-block-text">{block("reply_text", "replyText")}</p>
            <div className="card card-accent">
              <h3 className="site-block-text">{block("email_heading", "email")}</h3>
              <p className="site-block-text">{block("email_invite", "emailText")}</p>
              {emailAddress && (
                <p>
                  {validEmail ? (
                    <a href={`mailto:${emailAddress}`}>{emailAddress}</a>
                  ) : (
                    emailAddress
                  )}
                </p>
              )}
              {phone && (
                <p>
                  <strong>{t("phoneLabel")}</strong>{" "}
                  {validPhone ? <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a> : phone}
                </p>
              )}
              {address && (
                <p className="site-block-text">
                  <strong>{t("addressLabel")}</strong> {address}
                </p>
              )}
              {officeHours && (
                <p className="site-block-text">
                  <strong>{t("hoursLabel")}</strong> {officeHours}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
