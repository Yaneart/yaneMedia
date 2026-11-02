import { MediaPosterFallback, type MediaDetails } from '@/entities/media';
import { YaneMark, YaneMarkField } from '@/shared';
import { useEffect, useState, type ReactNode } from 'react';

export type MediaInfoProps = {
  media: MediaDetails;
  actions?: ReactNode;
  ratings?: ReactNode;
  navigation?: ReactNode;
  variant?: 'default' | 'watch';
};

export type MediaFactsProps = {
  media: MediaDetails;
  className?: string;
};

export function MediaDescriptionPanel({
  children,
  className = '',
  compact = false,
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section
      aria-label="Полное описание"
      className={`relative isolate overflow-hidden rounded-card border border-context-border bg-linear-to-br from-watermark/28 via-watermark/18 to-watermark/24 p-2 shadow-surface sm:p-3 ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-card"
      >
        <YaneMarkField />
        <YaneMark className="absolute -top-10 -right-12 size-56 rotate-[138deg] text-watermark opacity-[0.26]" />
        <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-watermark/8" />
      </div>
      <div
        className={`relative z-10 rounded-card border border-context-border/80 bg-surface/70 ${compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5'}`}
      >
        <h2 className="text-heading text-text-primary">Описание</h2>
        {children}
      </div>
    </section>
  );
}

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

export function MediaFacts({ media, className = '' }: MediaFactsProps) {
  if (media.genres.length === 0) return null;

  return (
    <dl className={`grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-x-2 ${className}`}>
      <div className="col-span-2 grid min-w-0 grid-cols-subgrid">
        <dt className="shrink-0 text-text-secondary">Жанры:</dt>
        <dd className="min-w-0 text-text-primary">{media.genres.join(', ')}</dd>
      </div>
    </dl>
  );
}

function MediaInfoPoster({ media, className }: { media: MediaDetails; className: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!failedUrl) return;
    const retry = () => setFailedUrl(null);
    const timer = window.setTimeout(retry, 10_000);
    window.addEventListener('online', retry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', retry);
    };
  }, [failedUrl]);

  const poster = media.poster;
  return (
    <div
      className={`relative aspect-2/3 w-full overflow-hidden bg-elevated shadow-surface ${className}`}
    >
      <MediaPosterFallback mediaRef={media.mediaRef} title={media.title} type={media.type} />
      {poster && poster.url !== failedUrl && (
        <img
          src={poster.url}
          alt={`Постер: ${media.title}`}
          width={poster.width}
          height={poster.height}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedUrl(poster.url)}
        />
      )}
    </div>
  );
}

export function MediaInfo({
  media,
  actions,
  ratings,
  navigation,
  variant = 'default',
}: MediaInfoProps) {
  const isWatchLayout = variant === 'watch';
  const metadata = [
    typeLabels[media.type],
    media.year?.toString(),
    media.runtimeMinutes ? formatRuntime(media.runtimeMinutes) : undefined,
    !ratings && media.rating
      ? `Рейтинг каталога: ${media.rating.value} / ${media.rating.scale}`
      : undefined,
  ].filter((item): item is string => item !== undefined);
  if (isWatchLayout) {
    return (
      <section className="media-info-watch" aria-label="Информация о произведении">
        <div className="media-info-poster">
          <MediaInfoPoster media={media} className="rounded-overlay" />
        </div>
        <div className="media-info-content">
          <div className="media-info-heading min-w-0">
            <h1 data-page-heading tabIndex={-1} className="text-text-primary">
              {media.title}
            </h1>
            {media.originalTitle && (
              <p
                className="mt-1 truncate text-caption text-text-secondary"
                title={media.originalTitle}
              >
                {media.originalTitle}
              </p>
            )}
            <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-caption text-text-secondary">
              {metadata.map((item, index) => (
                <span key={item}>
                  {index > 0 && (
                    <span className="mr-2" aria-hidden="true">
                      ·
                    </span>
                  )}
                  {item}
                </span>
              ))}
            </p>
          </div>
          {actions && (
            <div className="media-info-actions flex min-w-0 flex-wrap gap-2">{actions}</div>
          )}
          {ratings && <div className="media-info-ratings min-w-0">{ratings}</div>}
          <MediaFacts media={media} className="media-info-facts text-caption" />
          {navigation && <div className="media-info-navigation min-w-0">{navigation}</div>}
        </div>
      </section>
    );
  }
  const mobileMetadata = [
    media.year?.toString(),
    media.runtimeMinutes ? formatRuntime(media.runtimeMinutes) : undefined,
    !ratings && media.rating ? `Каталог: ${media.rating.value}` : undefined,
  ].filter((item): item is string => item !== undefined);

  const fullWidthOnMobile = media.poster ? 'col-span-2 md:col-span-1 md:col-start-2' : '';

  return (
    <section
      className={[
        'grid gap-x-4 sm:gap-x-6 md:gap-x-8',
        'max-w-6xl gap-y-5',
        media.poster
          ? 'grid-cols-[6rem_minmax(0,1fr)] min-[360px]:grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[9rem_minmax(0,1fr)] md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]'
          : 'grid-cols-1',
      ].join(' ')}
    >
      {media.poster && (
        <MediaInfoPoster
          media={media}
          className="rounded-overlay md:row-span-3 md:max-w-60 md:rounded-card"
        />
      )}

      <div className="flex min-w-0 flex-col self-start">
        <div
          className={[
            'order-3 mt-3 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary',
            'flex md:hidden',
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
            'hidden md:flex',
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
          data-page-heading
          tabIndex={-1}
          className={[
            'order-1 text-heading text-text-primary md:order-2 md:mt-3',
            'md:text-title',
          ].join(' ')}
        >
          {media.title}
        </h1>

        {media.originalTitle && (
          <p className="order-2 mt-1 text-caption text-text-secondary md:order-3">
            {media.originalTitle}
          </p>
        )}
      </div>

      {ratings && <div className={`${fullWidthOnMobile} min-w-0`}>{ratings}</div>}

      {media.description && (
        <p className={[fullWidthOnMobile, 'max-w-3xl text-body text-text-secondary'].join(' ')}>
          {media.description}
        </p>
      )}

      <div
        className={`${fullWidthOnMobile} flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-8`}
      >
        {actions && <div className="flex w-full flex-wrap gap-3">{actions}</div>}
        <MediaFacts media={media} className="gap-y-2 text-caption" />
      </div>

      {navigation && <div className={`${fullWidthOnMobile} min-w-0`}>{navigation}</div>}
    </section>
  );
}
