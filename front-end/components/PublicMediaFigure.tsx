"use client";

import Image from "next/image";
import { useState } from "react";
import type { MediaItem } from "@/lib/api";

export default function PublicMediaFigure({
  media,
  className,
  caption,
  priority = false,
}: {
  media: MediaItem;
  className?: string;
  caption?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const widths = [480, 960, 1600];
  const sizes = "(max-width: 768px) 100vw, 52rem";
  const srcSet = widths.map((width) => `${media.file_path}?w=${width} ${width}w`).join(", ");
  const alt = media.decorative ? "" : media.alt_text;
  return (
    <figure
      className={className ? `public-media-figure ${className}` : "public-media-figure"}
      style={{ aspectRatio: `${media.width || 16} / ${media.height || 9}` }}
    >
      {failed ? (
        <div
          className="public-media-fallback"
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
          aria-hidden={alt ? undefined : true}
        />
      ) : (
        <picture>
          <source srcSet={srcSet} sizes={sizes} />
          <Image
            src={`${media.file_path}?w=960`}
            alt={alt}
            width={media.width || 960}
            height={media.height || 540}
            sizes={sizes}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            unoptimized
            onError={() => setFailed(true)}
          />
        </picture>
      )}
      {(caption ?? media.title) && <figcaption>{caption ?? media.title}</figcaption>}
    </figure>
  );
}
