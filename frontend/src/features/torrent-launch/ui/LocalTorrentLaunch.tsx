import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/entities/auth';
import { getTorrentCandidates, resolveTorrentCandidate } from '@/entities/torrent-session';
import { CompanionDialog, useCompanionConnection } from '@/features/companion';
import { Button, Select, Spinner } from '@/shared';
import { CandidateCard } from './CandidateCard';
import {
  selectCandidates,
  emptyCandidateFilters,
  type CandidateSort,
} from '../model/candidateView';
import { useLocalTorrent } from '../model/useLocalTorrent';

export function LocalTorrentLaunch({
  mediaRef,
  season,
  episode,
}: {
  mediaRef: string;
  season?: number;
  episode?: number;
}) {
  const { state: auth } = useAuth();
  const owner = auth.status === 'authenticated' ? auth.user.email : 'guest';
  const connection = useCompanionConnection();
  const [connectOpen, setConnectOpen] = useState(false);
  const [sort, setSort] = useState<CandidateSort>('best');
  const [magnet, setMagnet] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const local = useLocalTorrent();
  const search = useQuery({
    queryKey: ['local-torrent-candidates', owner, mediaRef, season, episode],
    queryFn: ({ signal }) => getTorrentCandidates(mediaRef, season, episode, signal),
    enabled: false,
    retry: false,
    gcTime: 0,
  });
  const candidates = selectCandidates(search.data?.candidates ?? [], sort, emptyCandidateFilters);
  const videos =
    local.snapshot?.files.filter(
      (file) => /\.(mkv|mp4|m4v|avi|mov|ts|webm)$/i.test(file.name) && file.size > 0,
    ) ?? [];
  function manual(event: FormEvent) {
    event.preventDefault();
    setInputError(null);
    if (!magnet.startsWith('magnet:?') || new TextEncoder().encode(magnet).length > 4096) {
      setInputError('Введите magnet-ссылку размером до 4 Кб.');
      return;
    }
    void local.start(async () => ({ kind: 'magnet', value: magnet }));
  }
  async function upload(file: File | undefined) {
    setInputError(null);
    if (!file) return;
    if (
      !file.name.toLowerCase().endsWith('.torrent') ||
      file.size === 0 ||
      file.size > 2 * 1024 ** 2
    ) {
      setInputError('Выберите файл .torrent размером до 2 Мб.');
      return;
    }
    await local.start(async (signal) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      signal.throwIfAborted();
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { kind: 'metainfo', base64: btoa(binary) };
    });
  }
  return (
    <section className="space-y-4 p-3" aria-label="Локальная загрузка торрента">
      <p className="text-sm text-text-secondary">
        Раздача загружается на этом компьютере через yaneCompanion. Подготовка видео к просмотру
        пока недоступна.
      </p>
      <Button variant="secondary" size="small" onClick={() => setConnectOpen(true)}>
        Подключить помощник
      </Button>
      <CompanionDialog
        connection={connection}
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={search.isFetching || local.pending}
          onClick={() => {
            setInputError(null);
            void search.refetch();
          }}
        >
          Найти раздачи
        </Button>
        <Select
          aria-label="Сортировка раздач"
          placeholder="Лучшие"
          allowEmpty={false}
          value={sort}
          onChange={(value) => setSort(value as CandidateSort)}
          options={[
            { value: 'best', label: 'Лучшие' },
            { value: 'seeders', label: 'Больше раздающих' },
            { value: 'newest', label: 'Сначала новые' },
          ]}
        />
      </div>
      {search.isFetching && <Spinner label="Ищем раздачи" />}
      {search.isError && (
        <p role="alert" className="text-sm text-error">
          Поиск сейчас недоступен. Повторите попытку или добавьте торрент вручную.
        </p>
      )}
      {search.data?.degraded && (
        <p className="text-sm text-text-secondary">
          Часть источников недоступна. Показаны доступные результаты.
        </p>
      )}
      {search.data && !candidates.length && (
        <p className="text-sm text-text-secondary">
          Подходящих раздач не найдено. Добавьте торрент вручную или повторите поиск.
        </p>
      )}
      <div className="space-y-2">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.candidateRef}
            candidate={candidate}
            pending={local.pending || !!local.snapshot}
            onSelect={() =>
              void local.start((signal) => resolveTorrentCandidate(candidate.candidateRef, signal))
            }
          />
        ))}
      </div>
      <form onSubmit={manual} className="space-y-2">
        <label className="block text-sm">
          Magnet-ссылка
          <input
            aria-label="Magnet-ссылка"
            value={magnet}
            onChange={(event) => setMagnet(event.target.value)}
            className="mt-1 w-full rounded-control border border-border bg-control p-2"
          />
        </label>
        <Button type="submit" disabled={local.pending || !!local.snapshot}>
          Загрузить локально
        </Button>
        <label className="block text-sm">
          Файл .torrent
          <input
            aria-label="Файл .torrent"
            type="file"
            accept=".torrent,application/x-bittorrent"
            disabled={local.pending || !!local.snapshot}
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = '';
            }}
            className="mt-1 block max-w-full"
          />
        </label>
      </form>
      {(inputError || local.error) && (
        <p role="alert" className="text-sm text-error">
          {inputError ?? local.error}
        </p>
      )}
      {local.pending && (
        <p role="status" className="text-sm text-text-secondary">
          {local.snapshot?.state === 'awaiting_file'
            ? 'Загружаем выбранный видеофайл…'
            : 'Получаем список файлов раздачи…'}
        </p>
      )}
      {local.snapshot && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Файлы раздачи</p>
          {!videos.length && local.snapshot.state === 'awaiting_file' && (
            <p className="text-sm text-text-secondary">В раздаче нет подходящих видеофайлов.</p>
          )}
          {videos.map((file) => (
            <Button
              key={file.fileRef}
              variant="secondary"
              disabled={local.pending}
              onClick={() => void local.select(file.fileRef)}
              className="w-full overflow-hidden text-left"
            >
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                {file.name}
                {local.snapshot?.selectedFileRef === file.fileRef ? ' · выбран' : ''}
              </span>
            </Button>
          ))}
          {local.snapshot.downloadedBytes > 0 && (
            <p role="status" className="text-sm text-success">
              Локальная загрузка работает. Получено{' '}
              {local.snapshot.downloadedBytes.toLocaleString('ru-RU')} байт.
            </p>
          )}
          <Button variant="secondary" onClick={local.stop}>
            Остановить загрузку
          </Button>
        </div>
      )}
    </section>
  );
}
