"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import BilingualField from "@/components/ui/BilingualField";
import MediaPicker from "@/components/MediaPicker";
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
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div className="site-content-image-row">
        {mediaID ? (
          <Image
            className="site-content-thumb"
            src={`/api/staff/media/${mediaID}/file?w=480`}
            alt=""
            width={480}
            height={270}
            unoptimized
          />
        ) : (
          <div className="site-content-thumb cover-placeholder" aria-hidden="true" />
        )}
        <button type="button" className="btn btn-outline" onClick={() => setPickerOpen(true)}>
          {chooseImageLabel}
        </button>
      </div>
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
            <label className="field" htmlFor={fieldID}>
              <span>{captionLabel}</span>
              <textarea
                id={fieldID}
                rows={3}
                maxLength={2000}
                value={captions[locale]}
                onChange={(event) => onCaptionChange(locale, event.target.value)}
              />
            </label>
          );
        }}
      </BilingualField>
      <MediaPicker
        isOpen={pickerOpen}
        selectedMediaID={mediaID}
        slotHint={imageHint}
        onClose={() => setPickerOpen(false)}
        onSelect={(nextMediaID, media) => {
          onMediaChange(nextMediaID, media);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
