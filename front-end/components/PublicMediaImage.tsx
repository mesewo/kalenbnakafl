import { fetchPublic, PublicApiError } from "@/lib/server-api";
import type { MediaItem } from "@/lib/api";
import PublicMediaFigure from "@/components/PublicMediaFigure";

export { default as PublicMediaFigure } from "@/components/PublicMediaFigure";

export async function getPublicMedia(mediaID: number, locale: "en" | "am") {
  try {
    return await fetchPublic<MediaItem>(`/media/${mediaID}`, locale);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) return null;
    throw error;
  }
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
