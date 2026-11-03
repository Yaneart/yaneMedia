import { useEffect, useRef, useState } from 'react';
import type { TorrentEpisode } from '../model/torrentEpisodes';

export function TorrentFilePicker({
  files,
  onSelect,
  missing,
}: {
  files: readonly TorrentEpisode[];
  onSelect: (fileRef: string) => void;
  missing: boolean;
}) {
  const [season, setSeason] = useState<string>('');
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('select,button')?.focus();
  }, []);
  const seasons = [
    ...new Set(
      files.map((row) => row.episode?.seasonNumber).filter((number) => number !== undefined),
    ),
  ];
  const visible = season
    ? files.filter((row) => String(row.episode?.seasonNumber) === season)
    : files;
  return (
    <div
      ref={panelRef}
      className="pointer-events-auto flex max-h-full w-full max-w-lg flex-col gap-2 rounded-control bg-black/80 p-3 text-left text-sm text-white"
      aria-label="Выбор файла торрента"
    >
      <p className="font-semibold">
        {missing ? 'Сохранённая серия не найдена в этой раздаче' : 'Выберите видео'}
      </p>
      {seasons.length > 1 && (
        <select
          aria-label="Сезон торрента"
          value={season}
          onChange={(event) => setSeason(event.target.value)}
          className="rounded-control bg-neutral-800 p-2"
        >
          <option value="">Все сезоны и файлы</option>
          {seasons.map((number) => (
            <option key={number} value={number}>
              {number} сезон
            </option>
          ))}
        </select>
      )}
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {visible.map((row) => (
          <button
            key={row.file.ref}
            type="button"
            onClick={() => onSelect(row.file.ref)}
            className="block w-full break-words rounded-control px-3 py-2 text-left hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
          >
            {row.episode?.seasonNumber !== undefined ? `${row.episode.seasonNumber} сезон · ` : ''}
            {row.label}
          </button>
        ))}
      </div>
    </div>
  );
}
