import { CalendarIcon, HistoryIcon } from '@/shared';
import { formatReleaseDate } from './releasePresentation';

export function ReleasePosterOverlay({
  date,
  episode = false,
}: {
  date?: string;
  episode?: boolean;
}) {
  const Icon = episode ? CalendarIcon : HistoryIcon;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/95 via-black/45 to-black/20 p-4 text-white sm:p-5">
      <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-white/65 uppercase">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {episode ? 'Новая серия' : 'Скоро на экране'}
      </span>
      <div className="text-lg leading-snug font-semibold tracking-tight sm:text-xl">
        {date ? <time dateTime={date}>{formatReleaseDate(date)}</time> : formatReleaseDate()}
      </div>
    </div>
  );
}
