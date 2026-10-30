import { getPublicMedia, PublicMediaFigure } from "@/components/PublicMediaImage";
import type { MediaItem } from "@/lib/api";

type Props = { content: string; locale: "en" | "am"; coverMediaID?: number | null };
const mediaToken = /\{\{media:([1-9][0-9]*)\}\}/g;

export async function PostBody({ content, locale, coverMediaID }: Props) {
  const tokens = [...content.matchAll(mediaToken)];
  const ids = [...new Set(tokens.map((match) => Number(match[1])))];
  const images = new Map<number, MediaItem | null>();
  await Promise.all(ids.map(async (id) => images.set(id, await getPublicMedia(id, locale))));

  const parts = content.split(mediaToken);
  const body: React.ReactNode[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    if (index % 2 === 0) {
      body.push(<span key={`text-${index}`}>{parts[index]}</span>);
      continue;
    }
    const media = images.get(Number(parts[index]));
    if (media) body.push(<PublicMediaFigure key={`media-${index}`} media={media} />);
  }

  const cover = coverMediaID ? await getPublicMedia(coverMediaID, locale) : null;
  return (
    <>
      {cover ? (
        <PublicMediaFigure media={cover} className="public-media-cover" />
      ) : (
        <div className="media-placeholder public-media-cover" aria-hidden="true" />
      )}
      <div className="lede" style={{ whiteSpace: "pre-wrap" }}>
        {body}
      </div>
    </>
  );
}
