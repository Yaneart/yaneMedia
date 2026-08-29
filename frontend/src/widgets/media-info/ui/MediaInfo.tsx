import { MediaPosterFallback, type MediaDetails, type MediaPersonRole } from '@/entities/media';
import type { ReactNode } from 'react';

export type MediaInfoProps = {
  media: MediaDetails;
  actions?: ReactNode;
  variant?: 'default' | 'watch';
};

export type MediaFactsProps = {
  media: MediaDetails;
  className?: string;
};

const typeLabels = {
  movie: 'Фильм',
  series: 'Сериал',
  anime: 'Аниме',
} satisfies Record<MediaDetails['type'], string>;

function formatRuntime(runtimeMinutes: number) {
  const hours = Math.floor(runtimeMinutes / 60);
  const minutes = runtimeMinutes % 60;

  if (hours === 0) {
    return `${minutes} мин`;
  }

  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`;
}

function findPeopleByRole(media: MediaDetails, role: MediaPersonRole) {
  return media.persons.filter((credit) => credit.roles.includes(role));
}

export function MediaFacts({ media, className = '' }: MediaFactsProps) {
  const directors = findPeopleByRole(media, 'director');

  return (
    <dl className={`grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-x-2 ${className}`}>
      {directors.length > 0 && (
        <div className="col-span-2 grid min-w-0 grid-cols-subgrid">
          <dt className="shrink-0 text-text-secondary">Режиссёр:</dt>
          <dd className="min-w-0 text-text-primary">
            {directors.map((director) => director.name).join(', ')}
          </dd>
        </div>
      )}

      {media.countries.length > 0 && (
        <div className="col-span-2 grid min-w-0 grid-cols-subgrid">
          <dt className="shrink-0 text-text-secondary">Страна:</dt>
          <dd className="min-w-0 text-text-primary">{media.countries.join(', ')}</dd>
        </div>
      )}

      {media.genres.length > 0 && (
        <div className="col-span-2 grid min-w-0 grid-cols-subgrid">
          <dt className="shrink-0 text-text-secondary">Жанры:</dt>
          <dd className="min-w-0 text-text-primary">{media.genres.join(', ')}</dd>
        </div>
      )}
    </dl>
  );
}

export function MediaInfo({ media, actions, variant = 'default' }: MediaInfoProps) {
  const isWatchLayout = variant === 'watch';
  const metadata = [
    typeLabels[media.type],
    media.year?.toString(),
    media.runtimeMinutes ? formatRuntime(media.runtimeMinutes) : undefined,
    media.rating ? `${media.rating.value} / ${media.rating.scale}` : undefined,
  ].filter((item): item is string => item !== undefined);
  const mobileMetadata = [
    media.year?.toString(),
    media.runtimeMinutes ? formatRuntime(media.runtimeMinutes) : undefined,
    media.rating?.value.toString(),
  ].filter((item): item is string => item !== undefined);

  const fullWidthOnMobile = media.poster
    ? isWatchLayout
      ? 'col-span-2 xl:col-span-1'
      : 'col-span-2 md:col-span-1 md:col-start-2'
    : '';

  return (
    <section
      className={[
        'grid gap-x-4 sm:gap-x-6 md:gap-x-8',
        isWatchLayout
          ? 'max-w-none grid-cols-[6rem_minmax(0,1fr)] gap-y-4 min-[360px]:grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[9.5rem_minmax(0,1fr)] xl:grid-cols-1'
          : 'max-w-6xl gap-y-5',
        !isWatchLayout && media.poster
          ? 'grid-cols-[6rem_minmax(0,1fr)] min-[360px]:grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[9rem_minmax(0,1fr)] md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]'
          : !isWatchLayout
            ? 'grid-cols-1'
            : '',
      ].join(' ')}
    >
      {isWatchLayout && (
        <div className="min-w-0">
          <div className="relative aspect-2/3 w-full overflow-hidden rounded-overlay bg-elevated shadow-surface xl:rounded-card">
            <MediaPosterFallback mediaRef={media.mediaRef} title={media.title} type={media.type} />

            {media.poster && (
              <img
                src={media.poster.url}
                alt={`Постер: ${media.title}`}
                width={media.poster.width}
                height={media.poster.height}
                className="absolute inset-0 size-full object-cover"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            )}
          </div>

          {actions && (
            <div className="mt-4 hidden w-full flex-wrap gap-3 sm:flex xl:hidden">{actions}</div>
          )}
        </div>
      )}

      {!isWatchLayout && media.poster && (
        <img
          src={media.poster.url}
          alt={`Постер: ${media.title}`}
          width={media.poster.width}
          height={media.poster.height}
          className={[
            'aspect-2/3 w-full object-cover shadow-surface',
            'rounded-overlay md:row-span-3 md:max-w-60 md:rounded-card',
          ].join(' ')}
        />
      )}

      <div className="flex min-w-0 flex-col self-start">
        <div
          className={[
            'order-3 mt-3 items-center gap-x-2 text-caption text-text-secondary',
            isWatchLayout ? 'flex xl:hidden' : 'flex md:hidden',
          ].join(' ')}
        >
          {mobileMetadata.map((item, index) => (
            <span key={item} className="whitespace-nowrap">
              {index > 0 && (
                <span className="mr-2" aria-hidden="true">
                  •
                </span>
              )}
              {item}
            </span>
          ))}
        </div>

        <div
          className={[
            'order-1 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary',
            isWatchLayout ? 'hidden xl:flex' : 'hidden md:flex',
          ].join(' ')}
        >
          {metadata.map((item, index) => (
            <span key={item} className="whitespace-nowrap">
              {index > 0 && (
                <span className="mr-2" aria-hidden="true">
                  •
                </span>
              )}
              {item}
            </span>
          ))}
        </div>

        <h1
          className={[
            'order-1 text-heading text-text-primary md:order-2 md:mt-3',
            isWatchLayout ? 'xl:text-title' : 'md:text-title',
          ].join(' ')}
        >
          {media.title}
        </h1>

        {media.originalTitle && (
          <p className="order-2 mt-1 text-caption text-text-secondary md:order-3">
            {media.originalTitle}
          </p>
        )}

        {isWatchLayout && actions && (
          <div className="order-4 mt-4 flex w-full flex-wrap gap-3 sm:hidden xl:flex">
            {actions}
          </div>
        )}

        {isWatchLayout && media.description && (
          <div className="order-5 mt-5 hidden sm:block xl:hidden">
            <h2 className="text-heading text-text-primary">Описание</h2>
            <p className="mt-2 line-clamp-6 text-body text-text-secondary">{media.description}</p>
          </div>
        )}
      </div>

      {media.description && !isWatchLayout && (
        <p className={[fullWidthOnMobile, 'max-w-3xl text-body text-text-secondary'].join(' ')}>
          {media.description}
        </p>
      )}

      {isWatchLayout ? (
        <MediaFacts
          media={media}
          className={`${fullWidthOnMobile} hidden gap-2 text-caption xl:grid`}
        />
      ) : (
        <div
          className={`${fullWidthOnMobile} flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8`}
        >
          {actions && <div className="flex w-full flex-wrap gap-3">{actions}</div>}
          <MediaFacts media={media} className="gap-y-2 text-caption" />
        </div>
      )}
    </section>
  );
}
