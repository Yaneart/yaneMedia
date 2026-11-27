import { CalendarIcon, HistoryIcon } from '@/shared';
import { formatReleaseDate } from './releasePresentation';

const labels = { upcoming: 'Скоро на экране', episode: 'Новая серия', premiere: 'Премьера' };

export function ReleasePosterOverlay({
  date,
  kind = 'upcoming',
}: {
  date?: string;
  kind?: keyof typeof labels;
}) {
  const Icon = kind === 'upcoming' ? HistoryIcon : CalendarIcon;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/95 via-black/45 to-black/20 p-4 text-white sm:p-5">
      <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-white/65 uppercase wide:text-xs">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {labels[kind]}
      </span>
      <div className="text-lg leading-snug font-semibold tracking-tight sm:text-xl">
        {date ? <time dateTime={date}>{formatReleaseDate(date)}</time> : formatReleaseDate()}
      </div>
    </div>
  );
}
