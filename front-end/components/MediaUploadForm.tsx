"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError, apiUpload } from "@/lib/api";

type Locale = "en" | "am";

type UploadMediaResponse = { id: number };

export default function MediaUploadForm({
  onUploaded,
}: {
  onUploaded: (mediaID: number) => Promise<void> | void;
}) {
  const t = useTranslations("dashboard");
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [titles, setTitles] = useState<Record<Locale, string>>({ en: "", am: "" });
  const [altTexts, setAltTexts] = useState<Record<Locale, string>>({ en: "", am: "" });
  const [decorative, setDecorative] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  function languageName(locale: Locale) {
    return locale === "en" ? t("english") : t("amharic");
  }

  function chooseFile(nextFile?: File) {
    setFile(nextFile ?? null);
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError(t("mediaChooseFile"));
      return;
    }
    if (!decorative && (!altTexts.en.trim() || !altTexts.am.trim())) {
      setError(t("mediaAltRequired"));
      return;
    }
    const translations: Record<Locale, { title?: string; alt_text?: string }> = {
      en: {},
      am: {},
    };
    for (const locale of ["en", "am"] as const) {
      if (titles[locale].trim()) translations[locale].title = titles[locale].trim();
      if (altTexts[locale].trim()) translations[locale].alt_text = altTexts[locale].trim();
    }
    const body = new FormData();
    body.append("translations", JSON.stringify(translations));
    body.append("decorative", String(decorative));
    body.append("file", file);
    setUploading(true);
    setProgress(0);
    setError("");
    try {
      const result = await apiUpload<UploadMediaResponse>("/staff/media", body, setProgress);
      await onUploaded(result.id);
      setFile(null);
      setTitles({ en: "", am: "" });
      setAltTexts({ en: "", am: "" });
      setDecorative(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    } catch (uploadError) {
      const code = uploadError instanceof ApiError ? uploadError.code : "";
      if (
        code === "media.this_file_type_is_not_supported" ||
        code === "media.choose_a_supported_file"
      ) {
        setError(t("mediaInvalidType"));
      } else if (code === "media.uploaded_file_exceeds_the_size_limit") {
        setError(t("mediaFileTooLarge"));
      } else if (code === "media.translations_are_required_and_must_be_valid") {
        setError(t("mediaAltRequired"));
      } else {
        setError(t("uploadMediaFailed"));
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="media-upload-form" onSubmit={submit}>
      <div
        className="media-upload-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          chooseFile(event.dataTransfer.files[0]);
        }}
      >
        <p>{t("mediaDropFiles")}</p>
        <button
          className="btn btn-outline btn-small"
          type="button"
          onClick={() => inputRef.current?.click()}
        >
          {t("mediaChooseFile")}
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          id="media-upload-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={t("file")}
          tabIndex={-1}
          onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
        />
        {file && <p className="meta">{file.name}</p>}
      </div>
      <div className="grid-2">
        {(["en", "am"] as const).map((locale) => (
          <div className="field" key={locale}>
            <label htmlFor={`media-title-${locale}`}>
              {t("mediaImageName")} {"("}
              {languageName(locale)}
              {")"}
            </label>
            <input
              id={`media-title-${locale}`}
              value={titles[locale]}
              maxLength={180}
              onChange={(event) =>
                setTitles((current) => ({ ...current, [locale]: event.target.value }))
              }
            />
          </div>
        ))}
        {(["en", "am"] as const).map((locale) => (
          <div className="field" key={locale}>
            <label htmlFor={`media-alt-${locale}`}>
              {t("mediaAltText")} {"("}
              {languageName(locale)}
              {")"}
            </label>
            <input
              id={`media-alt-${locale}`}
              value={altTexts[locale]}
              maxLength={500}
              disabled={decorative}
              required={!decorative}
              onChange={(event) =>
                setAltTexts((current) => ({ ...current, [locale]: event.target.value }))
              }
            />
          </div>
        ))}
      </div>
      <div className="field media-decorative">
        <label htmlFor="media-decorative">
          <input
            id="media-decorative"
            type="checkbox"
            checked={decorative}
            onChange={(event) => setDecorative(event.target.checked)}
          />
          {t("decorativeImage")}
        </label>
      </div>
      <p className="meta">{t("mediaAltHelp")}</p>
      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}
      {uploading && (
        <div
          className="media-progress"
          role="progressbar"
          aria-label={t("mediaUploadProgress")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      <button className="btn btn-primary" type="submit" disabled={uploading}>
        {uploading ? t("uploading") : t("uploadMedia")}
      </button>
    </form>
  );
}
