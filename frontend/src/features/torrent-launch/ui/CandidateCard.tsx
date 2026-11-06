import type { TorrentCandidate } from '@/entities/torrent-session';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const unit = bytes < 1024 ** 2 ? 'Кб' : bytes < 1024 ** 3 ? 'Мб' : 'Гб';
  const divisor = unit === 'Кб' ? 1024 : unit === 'Мб' ? 1024 ** 2 : 1024 ** 3;
  return `${(bytes / divisor).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${unit}`;
}

export function CandidateCard({
  candidate,
  pending,
  selected = false,
  status,
  onSelect,
}: {
  candidate: TorrentCandidate;
  pending: boolean;
  selected?: boolean;
  status?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={selected}
      onClick={onSelect}
      className={`group w-full min-w-0 space-y-2 rounded-control border bg-control/40 p-3 text-left text-sm transition-colors hover:border-action/50 hover:bg-action/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40 disabled:opacity-50 ${selected ? 'border-action/60 ring-1 ring-action/20' : 'border-border'}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 break-words font-semibold text-text-primary [overflow-wrap:anywhere]">
          {candidate.title}
        </span>
        <span className="shrink-0 rounded bg-action/15 px-2 py-0.5 text-xs font-semibold text-action">
          {candidate.resolution ?? 'Видео'}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        <span>{candidate.tracker}</span>
        <span>{formatBytes(candidate.size)}</span>
        <span className={candidate.seeders ? 'text-emerald-400' : ''}>
          ↑ {candidate.seeders ?? '—'}
        </span>
        {candidate.publishedAt && (
          <span>{new Date(candidate.publishedAt).toLocaleDateString('ru-RU')}</span>
        )}
      </span>
      <span className="block text-xs text-text-secondary">
        {[candidate.quality, candidate.voice, candidate.studio].filter(Boolean).join(' · ') ||
          'Озвучка не указана'}
        {candidate.russianSubtitles ? ' · RU субтитры' : ''}
      </span>
      {candidate.stale && (
        <span className="block text-xs text-amber-400">
          Из предыдущего поиска · доступность проверится при выборе
        </span>
      )}
      {status && <span className="block text-xs text-action">{status}</span>}
    </button>
  );
}
