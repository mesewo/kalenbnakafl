import Image from "next/image";
import { fetchPublic, PublicApiError } from "@/lib/server-api";
import type { MediaItem } from "@/lib/api";

export async function getPublicMedia(mediaID: number, locale: "en" | "am") {
  try {
    return await fetchPublic<MediaItem>(`/media/${mediaID}`, locale);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) return null;
    throw error;
  }
}

export function PublicMediaFigure({ media, className }: { media: MediaItem; className?: string }) {
  const widths = [480, 960, 1600];
  const sizes = "(max-width: 768px) 100vw, 52rem";
  const srcSet = widths.map((width) => `${media.file_path}?w=${width} ${width}w`).join(", ");
  return (
    <figure
      className={className ? `public-media-figure ${className}` : "public-media-figure"}
      style={{ aspectRatio: `${media.width || 16} / ${media.height || 9}` }}
    >
      <picture>
        <source srcSet={srcSet} sizes={sizes} />
        <Image
          src={`${media.file_path}?w=960`}
          alt={media.decorative ? "" : media.alt_text}
          width={media.width || 960}
          height={media.height || 540}
          sizes={sizes}
          loading="lazy"
          unoptimized
        />
      </picture>
      {media.title && <figcaption>{media.title}</figcaption>}
    </figure>
  );
}

export default async function PublicMediaImage({
  mediaID,
  locale,
  className,
}: {
  mediaID?: number | null;
  locale: "en" | "am";
  className?: string;
}) {
  if (!mediaID) return <div className="media-placeholder" aria-hidden="true" />;
  const media = await getPublicMedia(mediaID, locale);
  if (!media) return <div className="media-placeholder" aria-hidden="true" />;
  return <PublicMediaFigure media={media} className={className} />;
}
