import type { MediaSummary } from '@/entities/media';
import { Button, PlayIcon } from '@/shared';

export type FeaturedMediaProps = {
  media: MediaSummary;
  onOpen: () => void;
};

const mediaTypeLabels = {
  movie: 'Фильм',
  series: 'Сериал',
  anime: 'Аниме',
} satisfies Record<MediaSummary['type'], string>;

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
    <div className="w-full max-w-2xl">
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded-pill border border-hero-search-border bg-hero-search px-3 py-1 text-caption font-semibold text-hero-text backdrop-blur-sm">
          {mediaTypeLabels[media.type]}
        </span>

        <span className="hidden text-caption font-medium tracking-[0.16em] text-hero-text-muted uppercase sm:inline">
          В центре внимания
        </span>
      </div>

      <div className="flex flex-wrap gap-y-1 text-sm text-hero-text-muted">
        {metadata.map((item, index) => (
          <span key={item} className={index > 1 ? 'hidden sm:inline' : ''}>
            {index > 0 && (
              <span className="mx-2" aria-hidden="true">
                •
              </span>
            )}
            {item}
          </span>
        ))}
      </div>

      <h1 className="mt-3 max-w-xl text-[clamp(2.25rem,4vw,4.5rem)] leading-[0.98] font-extrabold tracking-[-0.035em] text-hero-text">
        {media.title}
      </h1>

      {media.shortDescription && (
        <p className="mt-4 line-clamp-3 max-w-xl text-body text-hero-text-muted md:text-lg md:leading-relaxed">
          {media.shortDescription}
        </p>
      )}

      <div className="mt-7">
        <Button
          variant="bare"
          size="large"
          className="rounded-pill bg-hero-button pr-5 pl-2 text-hero-button-text shadow-[0_10px_28px_rgb(0_0_0/22%)] hover:-translate-y-0.5 hover:bg-hero-button-hover hover:shadow-[0_14px_34px_rgb(0_0_0/28%)] focus-visible:ring-watermark/50"
          onClick={onOpen}
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-hero-button-text/10">
            <PlayIcon className="size-4" />
          </span>
          Смотреть
        </Button>
      </div>
    </div>
  );
}
