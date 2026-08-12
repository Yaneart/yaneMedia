import type { MediaSummary } from '@/entities/media';
import { Button, PlayIcon } from '@/shared';

export type FeaturedMediaProps = {
  media: MediaSummary;
  onOpen: () => void;
};

export function FeaturedMedia({ media, onOpen }: FeaturedMediaProps) {
  const metadata: string[] = [];

  if (media.year !== undefined) {
    metadata.push(String(media.year));
  }

  if (media.rating) {
    metadata.push(`${media.rating.value} / ${media.rating.scale}`);
  }

  metadata.push(...media.genres.slice(0, 2));

  return (
    <section className="relative isolate min-h-[420px] overflow-hidden rounded-card bg-elevated md:min-h-[520px]">
      {media.backdrop && (
        <img
          src={media.backdrop.url}
          alt=""
          width={media.backdrop.width}
          height={media.backdrop.height}
          className="absolute inset-0 -z-20 size-full object-cover object-[58%_center] md:object-center"
        />
      )}

      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      <div className="flex min-h-[420px] max-w-2xl flex-col justify-end px-5 py-8 md:min-h-[520px] md:px-10 md:py-12">
        <div className="flex flex-wrap gap-y-1 text-sm text-white/65">
          {metadata.map((item, index) => (
            <span key={item}>
              {index > 0 && (
                <span className="mx-2" aria-hidden="true">
                  •
                </span>
              )}
              {item}
            </span>
          ))}
        </div>

        <h1 className="mt-3 text-title font-bold text-white">{media.title}</h1>

        {media.shortDescription && (
          <p className="mt-3 line-clamp-3 max-w-xl text-body text-white/70">
            {media.shortDescription}
          </p>
        )}

        <div className="mt-6">
          <Button size="large" className="bg-white text-black hover:bg-white/90" onClick={onOpen}>
            <PlayIcon className="size-5" />
            Смотреть
          </Button>
        </div>
      </div>
    </section>
  );
}
