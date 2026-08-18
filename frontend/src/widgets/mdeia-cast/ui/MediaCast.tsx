import type { MediaPerson } from '@/entities/media';
import { YaneMark } from '@/shared';

export type MediaCastProps = {
  persons: readonly MediaPerson[];
  className?: string;
};

export function MediaCast({ persons, className }: MediaCastProps) {
  const actors = persons.filter((person) => person.roles.includes('actor'));

  if (actors.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="media-cast-title" className={className}>
      <h2 id="media-cast-title" className="text-heading text-text-primary">
        В ролях
      </h2>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actors.map((actor) => (
          <li
            key={`${actor.name}-${actor.characterName ?? ''}`}
            className={[
              'grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3',
              'rounded-control border border-context-border',
              'bg-surface-elevated p-3',
            ].join(' ')}
          >
            <div
              aria-hidden={!actor.photo}
              className={[
                'relative aspect-3/4 w-full overflow-hidden rounded-overlay',
                'bg-linear-to-br from-watermark/25 via-surface-elevated to-background',
              ].join(' ')}
            >
              <YaneMark className="absolute -right-6 -bottom-2 h-[115%] w-[170%] rotate-6 text-watermark/35" />

              <div className="absolute inset-0 bg-linear-to-t from-black/20 via-transparent to-white/5" />

              {actor.photo && (
                <img
                  src={actor.photo.url}
                  alt={`Фото: ${actor.name}`}
                  width={actor.photo.width}
                  height={actor.photo.height}
                  className="absolute inset-0 size-full object-cover"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              )}
            </div>

            <div className="min-w-0 self-center">
              <p className="truncate font-semibold text-text-primary">{actor.name}</p>

              {actor.originalName && (
                <p className="mt-1 truncate text-caption text-text-secondary">
                  {actor.originalName}
                </p>
              )}

              {actor.characterName && (
                <p className="mt-3 truncate text-caption text-text-primary">
                  {actor.characterName}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
