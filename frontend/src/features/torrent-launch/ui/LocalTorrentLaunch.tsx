import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/entities/auth';
import { getTorrentCandidates, resolveTorrentCandidate } from '@/entities/torrent-session';
import { CompanionDialog, useCompanionConnection } from '@/features/companion';
import { Button } from '@/shared';
import { TorrentCandidatesPanel } from './TorrentCandidatesPanel';
import { TorrentManualForm } from './TorrentManualForm';
import type { useLocalTorrent } from '../model/useLocalTorrent';

export function LocalTorrentLaunch({
  mediaRef,
  season,
  episode,
  open,
  local,
  onStart,
}: {
  mediaRef: string;
  season?: number;
  episode?: number;
  open: boolean;
  local: ReturnType<typeof useLocalTorrent>;
  onStart: () => void;
}) {
  const { state: auth } = useAuth();
  const owner = auth.status === 'authenticated' ? auth.user.email : 'guest';
  const connection = useCompanionConnection();
  const [connectOpen, setConnectOpen] = useState(false);
  const [inputKind, setInputKind] = useState<'magnet' | 'file'>('magnet');
  const [magnet, setMagnet] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [selectedCandidateRef, setSelectedCandidateRef] = useState<string | null>(null);
  const selectionScope = JSON.stringify([owner, mediaRef, season, episode]);
  const waiting = useRef<{ resolve: Parameters<typeof local.start>[0]; scope: string } | null>(
    null,
  );
  const panelRef = useRef<HTMLElement>(null);
  const launch = (resolve: Parameters<typeof local.start>[0]) => {
    if (!connection.state.hasPairing) {
      waiting.current = { resolve, scope: selectionScope };
      setConnectOpen(true);
      return;
    }
    onStart();
    void local.start(resolve);
  };
  useEffect(() => {
    if (connection.state.status !== 'paired' || !connection.state.playbackReady || !waiting.current)
      return;
    const selected = waiting.current;
    waiting.current = null;
    if (selected.scope !== selectionScope) return;
    setConnectOpen(false);
    onStart();
    void local.start(selected.resolve);
  }, [connection.state.status, connection.state.playbackReady, local, onStart, selectionScope]);
  useEffect(() => {
    waiting.current = null;
    setConnectOpen(false);
    setSelectedCandidateRef(null);
    setMagnet('');
    setFile(null);
    setInputError(null);
  }, [selectionScope]);
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);
  const search = useQuery({
    queryKey: ['local-torrent-candidates', owner, mediaRef, season, episode],
    queryFn: ({ signal }) => getTorrentCandidates(mediaRef, season, episode, signal),
    enabled: open,
    staleTime: 60_000,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  function manual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInputError(null);
    const value = magnet.trim();
    if (inputKind === 'magnet') {
      if (!value.startsWith('magnet:?') || new TextEncoder().encode(value).length > 4096) {
        setInputError('Введите magnet-ссылку длиной до 4096 байт.');
        return;
      }
      setSelectedCandidateRef(null);
      launch(async () => ({ kind: 'magnet', value }));
      return;
    }
    if (
      !file ||
      !file.name.toLowerCase().endsWith('.torrent') ||
      !file.size ||
      file.size > 2 * 1024 ** 2
    ) {
      setInputError('Выберите файл .torrent размером до 2 Мб.');
      return;
    }
    const selected = file;
    setSelectedCandidateRef(null);
    launch(async (signal) => {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      signal.throwIfAborted();
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { kind: 'metainfo', base64: btoa(binary) };
    });
  }
  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className="min-w-0 outline-none"
      aria-label="Просмотр торрента"
    >
      <CompanionDialog
        connection={connection}
        open={connectOpen}
        onClose={() => {
          waiting.current = null;
          setConnectOpen(false);
        }}
      />
      {open && (
        <div className="space-y-4">
          <Button variant="secondary" size="small" onClick={() => setConnectOpen(true)}>
            yaneCompanion
          </Button>
          <TorrentCandidatesPanel
            key={selectionScope}
            query={search}
            pending={false}
            selectedCandidateRef={local.snapshot || local.pending ? selectedCandidateRef : null}
            status={local.playback ? 'Сейчас воспроизводится' : 'Подготовка торрента'}
            onRefresh={() => {
              setInputError(null);
              void search.refetch();
            }}
            onSelect={(candidate) => {
              if (
                (local.snapshot || local.pending) &&
                selectedCandidateRef === candidate.candidateRef &&
                !local.error
              )
                return;
              if (!search.data || Date.now() >= search.data.expiresAt) {
                setInputError(
                  'Результаты поиска устарели. Обновите список и выберите раздачу снова.',
                );
                void search.refetch();
                return;
              }
              setInputError(null);
              setSelectedCandidateRef(candidate.candidateRef);
              launch((signal) => resolveTorrentCandidate(candidate.candidateRef, signal));
            }}
          />
          <TorrentManualForm
            inputKind={inputKind}
            magnet={magnet}
            pending={false}
            onInputKindChange={(value) => {
              setInputKind(value);
              setInputError(null);
            }}
            onMagnetChange={(value) => {
              setMagnet(value);
              setInputError(null);
            }}
            onFileChange={(value) => {
              setFile(value);
              setInputError(null);
            }}
            onSubmit={manual}
          />
          {(inputError || local.error) && (
            <p role="alert" className="text-sm text-error">
              {inputError ?? local.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
