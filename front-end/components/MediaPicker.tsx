"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch, type MediaItem, type PageResponse } from "@/lib/api";
import MediaUploadForm from "@/components/MediaUploadForm";

const pageSize = 48;

export default function MediaPicker({
  isOpen,
  selectedMediaID,
  slotHint,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  selectedMediaID?: number | null;
  slotHint: string;
  onClose: () => void;
  onSelect: (mediaID: number, item?: MediaItem) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selectedID, setSelectedID] = useState<number | null>(selectedMediaID ?? null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"library" | "upload">("library");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const firstPage = await apiFetch<PageResponse<MediaItem>>(
        "/staff/media?kind=image&page=1&limit=50",
        {},
      );
      const pageCount = Math.max(1, Math.ceil(firstPage.total / 50));
      const remainingPages: PageResponse<MediaItem>[] = [];
      for (let firstPageNumber = 2; firstPageNumber <= pageCount; firstPageNumber += 10) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(10, pageCount - firstPageNumber + 1) }, (_, index) =>
            apiFetch<PageResponse<MediaItem>>(
              `/staff/media?kind=image&page=${firstPageNumber + index}&limit=50`,
              {},
            ),
          ),
        );
        remainingPages.push(...batch);
      }
      setItems([...firstPage.items, ...remainingPages.flatMap((result) => result.items)]);
      setPage(1);
    } catch {
      setError(t("loadMediaFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedID(selectedMediaID ?? null);
    setMode("library");
    setSearch("");
    void load();
  }, [isOpen, load, selectedMediaID]);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function trapFocus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      [item.title, item.original_name, item.alt_text].join(" ").toLocaleLowerCase().includes(term),
    );
  }, [items, search]);
  const selected = items.find((item) => item.id === selectedID);

  if (!isOpen) return null;

  async function uploaded(mediaID: number) {
    setMode("library");
    setPage(1);
    setSelectedID(mediaID);
    await load();
  }
  const pageItems = visibleItems.slice((page - 1) * pageSize, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(visibleItems.length / pageSize));

  return (
    <div
      className="modal-backdrop media-picker-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal media-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-picker-title"
        lang={locale}
      >
        <div className="modal-head">
          <div>
            <h2 id="media-picker-title">{t("mediaPickerTitle")}</h2>
            <p className="meta">{slotHint}</p>
          </div>
          <button
            ref={closeRef}
            className="close-btn"
            type="button"
            aria-label={t("closeDialog")}
            onClick={onClose}
          />
        </div>
        <div className="media-picker-tabs" role="tablist" aria-label={t("mediaPickerTitle")}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "library"}
            onClick={() => setMode("library")}
          >
            {t("mediaExistingImages")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            onClick={() => setMode("upload")}
          >
            {t("mediaUploadNew")}
          </button>
        </div>
        {mode === "upload" ? (
          <MediaUploadForm onUploaded={uploaded} />
        ) : (
          <>
            <label className="field media-search">
              <span>{t("mediaSearch")}</span>
              <input
                type="search"
                value={search}
                placeholder={t("mediaSearchPlaceholder")}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            {error && (
              <p className="status status-error" role="alert">
                {error}
              </p>
            )}
            {loading ? (
              <p role="status">{t("loadingMedia")}</p>
            ) : visibleItems.length === 0 ? (
              <p className="empty-state">{t("mediaNoSearchResults")}</p>
            ) : (
              <div className="media-picker-grid" aria-label={t("mediaExistingImages")}>
                {pageItems.map((item) => (
                  <button
                    className="media-picker-option"
                    type="button"
                    key={item.id}
                    aria-pressed={selectedID === item.id}
                    onClick={() => setSelectedID(item.id)}
                  >
                    <Image
                      src={`/api/staff/media/${item.id}/file?w=480`}
                      alt={item.decorative ? "" : item.alt_text}
                      width={item.width || 480}
                      height={item.height || 270}
                      sizes="(max-width: 480px) 42vw, 180px"
                      unoptimized
                    />
                    <span>{item.title || item.original_name || t("mediaUntitled")}</span>
                  </button>
                ))}
              </div>
            )}
            {pageCount > 1 && (
              <nav className="media-picker-pages" aria-label={t("mediaPages")}>
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => current - 1)}
                >
                  {t("previous")}
                </button>
                <span className="meta">{t("pageOf", { page, total: pageCount })}</span>
                <button
                  type="button"
                  className="btn btn-outline btn-small"
                  disabled={page >= pageCount || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  {t("next")}
                </button>
              </nav>
            )}
            {selected && (
              <div className="media-picker-preview">
                <Image
                  src={`/api/staff/media/${selected.id}/file?w=960`}
                  alt={selected.decorative ? "" : selected.alt_text}
                  width={selected.width || 960}
                  height={selected.height || 540}
                  sizes="(max-width: 480px) 85vw, 420px"
                  unoptimized
                />
                <p>{selected.title || selected.original_name || t("mediaUntitled")}</p>
              </div>
            )}
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={!selected}
                onClick={() => selected && onSelect(selected.id, selected)}
              >
                {t("mediaUseImage")}
              </button>
              <button className="btn btn-outline" type="button" onClick={onClose}>
                {t("cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
