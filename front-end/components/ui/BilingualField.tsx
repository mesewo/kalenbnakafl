"use client";

import { useState, type ReactNode } from "react";

export type BilingualLocale = "en" | "am";

export default function BilingualField({
  englishLabel,
  amharicLabel,
  missingEnglish = false,
  missingAmharic = false,
  missingEnglishLabel,
  missingAmharicLabel,
  children,
}: {
  englishLabel: string;
  amharicLabel: string;
  missingEnglish?: boolean;
  missingAmharic?: boolean;
  missingEnglishLabel: string;
  missingAmharicLabel: string;
  children: (locale: BilingualLocale) => ReactNode;
}) {
  const [selected, setSelected] = useState<BilingualLocale>("en");

  function focusLocale(locale: BilingualLocale) {
    setSelected(locale);
    document
      .getElementById(`bilingual-field-${locale}`)
      ?.querySelector<HTMLElement>("input, textarea, select, button")
      ?.focus();
  }

  return (
    <div className="bilingual-field">
      <div
        className="bilingual-field-tabs"
        role="group"
        aria-label={`${englishLabel} / ${amharicLabel}`}
      >
        <button
          type="button"
          className="btn btn-outline btn-small"
          aria-pressed={selected === "en"}
          onClick={() => focusLocale("en")}
        >
          {englishLabel}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-small"
          aria-pressed={selected === "am"}
          onClick={() => focusLocale("am")}
        >
          {amharicLabel}
        </button>
      </div>
      <div className="bilingual-field-grid">
        {(["en", "am"] as const).map((locale) => (
          <section className="bilingual-field-locale" id={`bilingual-field-${locale}`} key={locale}>
            <h3>
              {locale === "en" ? englishLabel : amharicLabel}
              {locale === "en" && missingEnglish && (
                <span className="badge status-pending" aria-label={missingEnglishLabel}>
                  {missingEnglishLabel}
                </span>
              )}
              {locale === "am" && missingAmharic && (
                <span className="badge status-pending" aria-label={missingAmharicLabel}>
                  {missingAmharicLabel}
                </span>
              )}
            </h3>
            {children(locale)}
          </section>
        ))}
      </div>
    </div>
  );
}
