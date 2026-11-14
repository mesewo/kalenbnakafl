"use client";

import { useTranslations } from "next-intl";
import BilingualField from "@/components/ui/BilingualField";
import Field from "@/components/ui/Field";
import MediaAssetField from "@/components/ui/MediaAssetField";
import type { MediaItem } from "@/lib/api";

export default function MediaCaptionFields({
  id,
  mediaID,
  captions,
  imageHint,
  chooseImageLabel,
  onMediaChange,
  onCaptionChange,
}: {
  id: string;
  mediaID: number | null;
  captions: { en: string; am: string };
  imageHint: string;
  chooseImageLabel: string;
  onMediaChange: (mediaID: number, media?: MediaItem) => void;
  onCaptionChange: (locale: "en" | "am", caption: string) => void;
}) {
  const t = useTranslations("dashboard");

  return (
    <>
      <MediaAssetField
        mediaID={mediaID}
        hint={imageHint}
        chooseLabel={chooseImageLabel}
        onChange={onMediaChange}
        layoutClassName="site-content-image-row"
        previewClassName="site-content-thumb"
        placeholderClassName="site-content-thumb cover-placeholder"
      />
      <BilingualField
        englishLabel={t("english")}
        amharicLabel={t("amharic")}
        missingEnglish={!captions.en.trim()}
        missingAmharic={!captions.am.trim()}
        missingEnglishLabel={t("missingEnglish")}
        missingAmharicLabel={t("missingAmharic")}
      >
        {(locale) => {
          const captionLabel = t(locale === "en" ? "englishCaption" : "amharicCaption");
          const fieldID = `${id}-${locale}`;
          return (
            <Field id={fieldID} label={captionLabel}>
              <textarea
                rows={3}
                maxLength={2000}
                value={captions[locale]}
                onChange={(event) => onCaptionChange(locale, event.target.value)}
              />
            </Field>
          );
        }}
      </BilingualField>
    </>
  );
}
