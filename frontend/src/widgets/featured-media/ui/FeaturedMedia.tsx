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
    <div className="flex min-h-[420px] max-w-2xl flex-col justify-end px-5 py-8 md:min-h-0 md:px-0 md:py-0">
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

      <h2 className="mt-3 text-[clamp(2rem,3vw,3.5rem)] leading-tight font-bold text-white">
        {media.title}
      </h2>

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
  );
}
