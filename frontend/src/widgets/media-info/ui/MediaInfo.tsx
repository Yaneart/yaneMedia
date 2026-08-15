import type { MediaDetails, MediaPersonRole } from '@/entities/media';
import type { ReactNode } from 'react';

export type MediaInfoProps = {
  media: MediaDetails;
  actions?: ReactNode;
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

export function MediaInfo({ media, actions }: MediaInfoProps) {
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

  const directors = findPeopleByRole(media, 'director');
  const fullWidthOnMobile = media.poster ? 'col-span-2 md:col-span-1 md:col-start-2' : '';

  return (
    <section
      className={[
        'grid max-w-6xl gap-x-4 gap-y-5 sm:gap-x-6 md:gap-x-8',
        media.poster
          ? 'grid-cols-[6rem_minmax(0,1fr)] min-[360px]:grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[9rem_minmax(0,1fr)] md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]'
          : 'grid-cols-1',
      ].join(' ')}
    >
      {media.poster && (
        <img
          src={media.poster.url}
          alt={`Постер: ${media.title}`}
          width={media.poster.width}
          height={media.poster.height}
          className="aspect-2/3 w-full rounded-overlay object-cover shadow-surface md:row-span-3 md:max-w-60 md:rounded-card"
        />
      )}

      <div className="flex flex-col self-start">
        <div className="order-3 mt-3 flex items-center gap-x-2 text-caption text-text-secondary md:hidden">
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

        <div className="order-1 hidden flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary md:flex">
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

        <h1 className="order-1 text-heading text-text-primary md:order-2 md:mt-3 md:text-title">
          {media.title}
        </h1>

        {media.originalTitle && (
          <p className="order-2 mt-1 text-caption text-text-secondary md:order-3">
            {media.originalTitle}
          </p>
        )}
      </div>

      {media.description && (
        <p className={`${fullWidthOnMobile} max-w-3xl text-body text-text-secondary`}>
          {media.description}
        </p>
      )}

      <div
        className={`${fullWidthOnMobile} flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8`}
      >
        {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}

        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-caption">
          {directors.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-text-secondary">Режиссёр:</dt>
              <dd className="text-text-primary">
                {directors.map((director) => director.name).join(', ')}
              </dd>
            </div>
          )}

          {media.countries.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-text-secondary">Страна:</dt>
              <dd className="text-text-primary">{media.countries.join(', ')}</dd>
            </div>
          )}

          {media.genres.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-text-secondary">Жанры:</dt>
              <dd className="text-text-primary">{media.genres.join(', ')}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
