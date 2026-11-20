import { HistoryIcon } from '@/shared';
import { formatReleaseDate } from './releasePresentation';

export function ReleasePosterOverlay({
  upcoming,
  releaseDate,
  nextEpisodeAt,
  ongoing,
}: {
  upcoming: boolean;
  releaseDate?: string;
  nextEpisodeAt?: string;
  ongoing?: boolean;
}) {
  if (upcoming)
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/95 via-black/45 to-black/20 p-4 text-white sm:p-5">
        <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-white/65 uppercase">
          <HistoryIcon aria-hidden="true" className="size-3.5" />
          Скоро на экране
        </span>
        <time
          dateTime={releaseDate}
          className="text-lg leading-snug font-semibold tracking-tight sm:text-xl"
        >
          {formatReleaseDate(releaseDate)}
        </time>
      </div>
    );
  if (!nextEpisodeAt && !ongoing) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/65 to-transparent px-3 pt-12 pb-3 text-white">
      <span className="inline-flex max-w-full items-center gap-2 text-xs font-medium leading-relaxed">
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-300" aria-hidden="true" />
        {nextEpisodeAt ? (
          <span>
            Новая серия · <time dateTime={nextEpisodeAt}>{formatReleaseDate(nextEpisodeAt)}</time>
          </span>
        ) : (
          'Сейчас выходит'
        )}
      </span>
    </div>
  );
}
