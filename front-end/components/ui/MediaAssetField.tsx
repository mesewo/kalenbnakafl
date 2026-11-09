"use client";

import Image from "next/image";
import { useState } from "react";
import MediaPicker from "@/components/MediaPicker";
import type { MediaItem } from "@/lib/api";

export default function MediaAssetField({
  mediaID,
  media,
  hint,
  chooseLabel,
  removeLabel,
  onChange,
  onRemove,
  layoutClassName,
  actionsClassName,
  previewClassName,
  placeholderClassName,
  imageWidth = 480,
  imageHeight = 270,
  fileWidth = 480,
  sizes,
}: {
  mediaID: number | null;
  media?: MediaItem;
  hint: string;
  chooseLabel: string;
  removeLabel?: string;
  onChange: (mediaID: number, media?: MediaItem) => void;
  onRemove?: () => void;
  layoutClassName: string;
  actionsClassName?: string;
  previewClassName: string;
  placeholderClassName?: string;
  imageWidth?: number;
  imageHeight?: number;
  fileWidth?: number;
  sizes?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div className={layoutClassName}>
        {mediaID !== null ? (
          <Image
            className={previewClassName}
            src={`/api/staff/media/${mediaID}/file?w=${fileWidth}`}
            alt={media?.decorative ? "" : (media?.alt_text ?? "")}
            width={media?.width || imageWidth}
            height={media?.height || imageHeight}
            sizes={sizes}
            unoptimized
          />
        ) : (
          placeholderClassName && <div className={placeholderClassName} aria-hidden="true" />
        )}
        <div className={actionsClassName}>
          <button type="button" className="btn btn-outline" onClick={() => setPickerOpen(true)}>
            {chooseLabel}
          </button>
          {mediaID !== null && onRemove && removeLabel && (
            <button type="button" className="btn btn-outline" onClick={onRemove}>
              {removeLabel}
            </button>
          )}
        </div>
      </div>
      <MediaPicker
        isOpen={pickerOpen}
        selectedMediaID={mediaID}
        slotHint={hint}
        onClose={() => setPickerOpen(false)}
        onSelect={(nextMediaID, selectedMedia) => {
          onChange(nextMediaID, selectedMedia);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
