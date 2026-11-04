import { useEffect, useState } from 'react';
import type { TorrentSessionState } from '@/entities/torrent-session';
import { Spinner } from '@/shared';

const stages: Record<TorrentSessionState, { label: string; start: number; limit: number }> = {
  created: { label: 'Подключаемся к раздаче', start: 0, limit: 12 },
  fetching_metadata: { label: 'Получаем данные раздачи', start: 12, limit: 30 },
  awaiting_file: { label: 'Выбираем видеофайл', start: 30, limit: 38 },
  probing: { label: 'Проверяем видеофайл', start: 38, limit: 65 },
  awaiting_playback: { label: 'Готовим видео к запуску', start: 65, limit: 70 },
  preparing: { label: 'Загружаем начало видео', start: 70, limit: 95 },
  ready: { label: 'Запускаем видео', start: 100, limit: 100 },
  failed: { label: 'Не удалось подготовить видео', start: 0, limit: 0 },
};

export function TorrentPreparation({ state = 'created' }: { state?: TorrentSessionState }) {
  const [progress, setProgress] = useState(0);
  const stage = stages[state];

  useEffect(() => {
    if (state === 'failed' || state === 'ready') return;
    const startedAt = Date.now();
    // Preparation has no byte-based total. Estimate within each confirmed stage;
    // even a slow or stalled torrent cannot reach 100 before the stream is ready.
    const timer = setInterval(() => {
      const estimate =
        stage.start +
        (stage.limit - stage.start) * (1 - Math.exp(-(Date.now() - startedAt) / 15_000));
      setProgress((previous) => Math.max(previous, estimate));
    }, 300);
    return () => clearInterval(timer);
  }, [stage, state]);

  const percent = state === 'ready' ? 100 : Math.min(95, Math.floor(progress));

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 text-center">
      <Spinner
        size="large"
        progress={percent}
        label="Подготовка торрента"
        aria-valuetext={`${percent}%. Примерная готовность к просмотру`}
        aria-live="off"
        className="text-[3rem] sm:text-[3.75rem] [&>span:first-child]:text-white"
      />
      <p aria-hidden="true" className="text-2xl font-semibold text-white tabular-nums sm:text-3xl">
        {percent}%
      </p>
      <span role="status" className="sr-only">
        {stage.label}
      </span>
    </div>
  );
}
