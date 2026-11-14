"use client";

import type { BilingualLocale } from "@/components/ui/BilingualField";

export default function ContentLanguageTabs({
  locale,
  label,
  englishLabel,
  amharicLabel,
  onChange,
}: {
  locale: BilingualLocale;
  label: string;
  englishLabel: string;
  amharicLabel: string;
  onChange: (locale: BilingualLocale) => void;
}) {
  return (
    <div role="tablist" aria-label={label}>
      <button
        type="button"
        role="tab"
        aria-selected={locale === "en"}
        onClick={() => onChange("en")}
      >
        {englishLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={locale === "am"}
        onClick={() => onChange("am")}
      >
        {amharicLabel}
      </button>
    </div>
  );
}
