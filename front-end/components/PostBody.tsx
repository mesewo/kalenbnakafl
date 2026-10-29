import Image from "next/image";
import { fetchPublic, PublicApiError } from "@/lib/server-api";
import type { MediaItem } from "@/lib/api";

type Props = { content: string; locale: "en" | "am"; coverMediaID?: number | null };
const mediaToken = /\{\{media:([1-9][0-9]*)\}\}/g;

async function publicImage(mediaID: number, locale: "en" | "am"): Promise<MediaItem | null> {
  try {
    return await fetchPublic<MediaItem>(`/media/${mediaID}`, locale);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) return null;
    throw error;
  }
}

function ImageView({ media }: { media: MediaItem }) {
  const sizes = "(max-width: 768px) 100vw, 52rem";
  const srcSet = [480, 960, 1600]
    .map((width) => `${media.file_path}?w=${width} ${width}w`)
    .join(", ");
  return (
    <figure>
      <picture>
        <source srcSet={srcSet} sizes={sizes} />
        <Image
          src={`${media.file_path}?w=1600`}
          alt={media.decorative ? "" : media.alt_text}
          width={media.width || 960}
          height={media.height || 540}
          sizes={sizes}
          unoptimized
        />
      </picture>
    </figure>
  );
}

export async function PostBody({ content, locale, coverMediaID }: Props) {
  const tokens = [...content.matchAll(mediaToken)];
  const ids = [...new Set(tokens.map((match) => Number(match[1])))];
  const images = new Map<number, MediaItem | null>();
  await Promise.all(ids.map(async (id) => images.set(id, await publicImage(id, locale))));

  const parts = content.split(mediaToken);
  const body: React.ReactNode[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    if (index % 2 === 0) {
      body.push(<span key={`text-${index}`}>{parts[index]}</span>);
      continue;
    }
    const media = images.get(Number(parts[index]));
    if (media) body.push(<ImageView key={`media-${index}`} media={media} />);
  }

  const cover = coverMediaID ? await publicImage(coverMediaID, locale) : null;
  return (
    <>
      {cover && <ImageView media={cover} />}
      <div className="lede" style={{ whiteSpace: "pre-wrap" }}>
        {body}
      </div>
    </>
  );
}
