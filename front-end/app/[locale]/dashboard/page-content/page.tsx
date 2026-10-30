"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { siteBlockCatalog, type SiteBlockDefinition } from "@/lib/site-block-catalog";

type Locale = "en" | "am";
type TranslationDraft = Record<Locale, string>;
type AdminSiteBlock = {
  page: string;
  key: string;
  updated_at: string;
  updated_by_name?: string;
  translations?: { en?: { text?: string }; am?: { text?: string } };
};
type AdminSiteBlocksResponse = { items: AdminSiteBlock[] };

const blockID = (block: SiteBlockDefinition) => `${block.page}.${block.key}`;
const locales: Locale[] = ["en", "am"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9][0-9 .()\-]{5,24}$/;

export default function PageContentAdminPage() {
  const t = useTranslations("dashboard");
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<AdminSiteBlock[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TranslationDraft>>({});
  const [saved, setSaved] = useState<Record<string, TranslationDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingID, setSavingID] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = useMemo(
    () =>
      siteBlockCatalog.some((block) => {
        const id = blockID(block);
        return locales.some((language) => drafts[id]?.[language] !== saved[id]?.[language]);
      }),
    [drafts, saved],
  );

  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<AdminSiteBlocksResponse>("/admin/site-blocks");
      const values: Record<string, TranslationDraft> = {};
      for (const definition of siteBlockCatalog) {
        const item = response.items.find(
          (candidate) => candidate.page === definition.page && candidate.key === definition.key,
        );
        values[blockID(definition)] = {
          en: item?.translations?.en?.text ?? "",
          am: item?.translations?.am?.text ?? "",
        };
      }
      setBlocks(response.items);
      setDrafts(values);
      setSaved(values);
    } catch {
      setError(t("loadPageContentFailed"));
    } finally {
      setLoading(false);
    }
  }, [user?.role, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(block: SiteBlockDefinition, language: Locale, text: string) {
    const id = blockID(block);
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [language]: text } }));
    setNotice("");
  }

  function validate(block: SiteBlockDefinition, value: TranslationDraft) {
    for (const language of locales) {
      const text = value[language].trim();
      if (block.kind === "email" && text && !emailPattern.test(text))
        return t("contentEmailInvalid");
      if (block.kind === "phone" && text && !phonePattern.test(text))
        return t("contentPhoneInvalid");
    }
    return "";
  }

  async function save(block: SiteBlockDefinition, value: TranslationDraft) {
    const validation = validate(block, value);
    if (validation) {
      setError(validation);
      return;
    }
    const id = blockID(block);
    setSavingID(id);
    setError("");
    setNotice("");
    try {
      await apiFetch(`/admin/site-blocks/${block.page}/${block.key}`, {
        method: "PUT",
        body: JSON.stringify({
          translations: { en: { text: value.en }, am: { text: value.am } },
        }),
      });
      setDrafts((current) => ({ ...current, [id]: value }));
      setSaved((current) => ({ ...current, [id]: value }));
      setNotice(t("contentSaved"));
      try {
        const refreshed = await apiFetch<AdminSiteBlocksResponse>("/admin/site-blocks");
        setBlocks(refreshed.items);
      } catch {
        setError(t("loadPageContentFailed"));
      }
    } catch {
      setError(t("savePageContentFailed"));
    } finally {
      setSavingID("");
    }
  }

  async function reset(block: SiteBlockDefinition) {
    if (!window.confirm(t("confirmContentReset"))) return;
    const empty = { en: "", am: "" };
    await save(block, empty);
  }

  const pageNames: Record<string, string> = {
    home: t("contentHomePage"),
    about: t("contentAboutPage"),
    contact: t("contentContactPage"),
  };
  if (user?.role !== "admin") {
    return (
      <p className="status status-error" role="alert">
        {t("adminAccessRequired")}
      </p>
    );
  }
  if (loading) return <p role="status">{t("contentLoading")}</p>;

  return (
    <div className="site-block-editor">
      <header className="dashboard-title">
        <div>
          <h1>{t("pageContentTitle")}</h1>
          <p>{t("pageContentIntro")}</p>
        </div>
      </header>
      {dirty && (
        <p className="status" role="status" aria-live="polite">
          {t("contentUnsaved")}
        </p>
      )}
      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="status status-success" role="status">
          {notice}
        </p>
      )}
      {(["home", "about", "contact"] as const).map((page) => (
        <section key={page} aria-labelledby={`content-${page}-title`} className="site-block-editor">
          <h2 id={`content-${page}-title`}>{pageNames[page]}</h2>
          {siteBlockCatalog
            .filter((block) => block.page === page)
            .map((block) => {
              const id = blockID(block);
              const value = drafts[id] ?? { en: "", am: "" };
              const baseline = saved[id] ?? { en: "", am: "" };
              const item = blocks.find(
                (candidate) => candidate.page === page && candidate.key === block.key,
              );
              const missingFallback = locales.some(
                (language) =>
                  !value[language].trim() && Boolean(value[language === "en" ? "am" : "en"].trim()),
              );
              return (
                <article className="card site-block-card" key={id}>
                  <header className="site-content-card-head">
                    <div>
                      <h3>{t(block.labelKey)}</h3>
                      <p>{t("contentFieldHelp")}</p>
                    </div>
                    <code>{`${page}.${block.key}`}</code>
                  </header>
                  {missingFallback && <small className="status">{t("contentFallback")}</small>}
                  <div className="site-block-editor-languages">
                    {locales.map((language) => {
                      const count = value[language].length;
                      const fieldID = `${id}-${language}`;
                      return (
                        <div className="field site-block-field" key={language}>
                          <label htmlFor={fieldID}>
                            {t(language === "en" ? "contentEnglish" : "contentAmharic")}
                          </label>
                          {block.kind ? (
                            <input
                              id={fieldID}
                              type={block.kind === "email" ? "email" : "tel"}
                              maxLength={block.maxLength ?? 20000}
                              value={value[language]}
                              onChange={(event) => update(block, language, event.target.value)}
                              placeholder={t("contentDefaultHint")}
                            />
                          ) : (
                            <textarea
                              id={fieldID}
                              maxLength={block.maxLength ?? 20000}
                              value={value[language]}
                              onChange={(event) => update(block, language, event.target.value)}
                              placeholder={t("contentDefaultHint")}
                              aria-describedby={`${fieldID}-count`}
                            />
                          )}
                          <small id={`${fieldID}-count`}>
                            {t("contentCharacterCount", {
                              count,
                              maximum: block.maxLength ?? 20000,
                            })}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                  <p className="site-block-meta">
                    {item?.updated_at
                      ? t("contentLastEdited", {
                          name: item.updated_by_name || t("contentUnknownEditor"),
                          date: new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(item.updated_at)),
                        })
                      : t("contentNotEdited")}
                  </p>
                  <div className="site-content-actions">
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={
                        savingID === id || (value.en === baseline.en && value.am === baseline.am)
                      }
                      onClick={() => void save(block, value)}
                    >
                      {savingID === id ? t("saving") : t("saveChanges")}
                    </button>
                    <button
                      className="btn btn-outline"
                      type="button"
                      disabled={savingID === id}
                      onClick={() => void reset(block)}
                    >
                      {t("contentReset")}
                    </button>
                  </div>
                </article>
              );
            })}
        </section>
      ))}
    </div>
  );
}
