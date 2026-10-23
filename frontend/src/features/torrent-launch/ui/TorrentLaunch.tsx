import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';

import { useAuth } from '@/entities/auth';
import {
  activeTorrentSessionQueryOptions,
  cacheTorrentSession,
  createFileSession,
  createMagnetSession,
  createCandidateSession,
  getTorrentCandidates,
  newTorrentIdempotencyKey,
  selectTorrentFile,
  startTorrentPlayback,
  stopTorrentSession,
  torrentSessionQueryOptions,
  torrentSessionQueryKeys,
  TorrentRequestError,
  type TorrentSession,
  type TorrentCandidate,
} from '@/entities/torrent-session';
import { ResendVerification } from '@/features/auth-form';
import { privateProfileQueryOptions } from '@/features/social-data';
import { SocialLoginLink, useRestoreSocialAction } from '@/features/social-access';
import { Button, Select, Spinner } from '@/shared';
import {
  candidateOptions,
  candidateTrackerLabel,
  emptyCandidateFilters,
  selectCandidates,
  type CandidateFilters,
  type CandidateSort,
} from '../model/candidateView';

const maxTorrentFileBytes = 2 * 1024 * 1024;
const maxMagnetBytes = 4096;

function describeCreateError(error: unknown): string {
  if (!(error instanceof TorrentRequestError))
    return 'Не удалось создать сессию. Попробуйте снова.';
  if (error.code === 'TORRENT_ACTIVE_SESSION_EXISTS')
    return 'У вас уже есть активный торрент. Завершите его перед запуском нового.';
  if (error.code === 'TORRENT_CAPACITY_EXCEEDED' || error.code === 'TORRENT_RESOURCE_LIMIT')
    return 'Сервис сейчас занят. Попробуйте позже.';
  if (error.code === 'TORRENT_INVALID_INPUT' || error.code === 'VALIDATION_FAILED')
    return 'Проверьте magnet-ссылку или файл .torrent.';
  if (error.code === 'TORRENT_FILE_TYPE_UNSUPPORTED') return 'Выберите корректный файл .torrent.';
  if (error.status === 413 || error.code === 'PAYLOAD_TOO_LARGE')
    return 'Файл .torrent не должен превышать 2 МиБ.';
  if (error.status === 429) return 'Слишком много попыток. Подождите и попробуйте снова.';
  if (error.status === 503 || error.kind === 'network')
    return 'Торрент-сервис временно недоступен. Попробуйте позже.';
  if (error.status === 401) return 'Сессия входа завершилась. Войдите снова.';
  if (error.status === 403) return 'Подтвердите email, чтобы смотреть торрент.';
  return 'Не удалось создать сессию. Попробуйте снова.';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const unit = bytes < 1024 ** 2 ? 'КиБ' : bytes < 1024 ** 3 ? 'МиБ' : 'ГиБ';
  const divisor = unit === 'КиБ' ? 1024 : unit === 'МиБ' ? 1024 ** 2 : 1024 ** 3;
  return `${(bytes / divisor).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${unit}`;
}

function CandidateCard({
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

function describeFailure(session: TorrentSession): string {
  switch (session.failure?.code) {
    case 'TORRENT_METADATA_TIMEOUT':
      return 'Не удалось получить данные раздачи вовремя. Проверьте доступность участников и попробуйте снова.';
    case 'TORRENT_NO_VIDEO_FILES':
      return 'В раздаче нет подходящих видеофайлов. Выберите другой торрент.';
    case 'TORRENT_SIZE_LIMIT_EXCEEDED':
      return 'Размер раздачи или видео превышает допустимый предел. Выберите другой торрент.';
    case 'TORRENT_UNSUPPORTED_MEDIA':
      return 'Формат этого видео не поддерживается. Выберите другой файл или торрент.';
    case 'TORRENT_PROBE_TIMEOUT':
      return 'Не удалось проверить видео вовремя. Проверьте скорость раздачи и попробуйте снова.';
    case 'TORRENT_PLAYBACK_TIMEOUT':
      return 'Видео слишком долго загружается от участников. Попробуйте позже или выберите другую раздачу.';
    case 'TORRENT_TRANSCODE_FAILED':
      return 'Не удалось преобразовать видео для браузера. Попробуйте другой файл.';
    case 'TORRENT_CAPACITY_EXCEEDED':
    case 'TORRENT_RESOURCE_LIMIT':
      return 'Сервис сейчас занят. Попробуйте позже.';
    case 'TORRENT_UPSTREAM_UNAVAILABLE':
    case 'TORRENT_UNAVAILABLE':
      return 'Торрент-сервис временно недоступен. Попробуйте позже.';
    default:
      return 'Не удалось подготовить торрент. Попробуйте снова или выберите другой.';
  }
}

function describeCommandError(error: unknown, action: string): string {
  if (error instanceof TorrentRequestError) {
    if (error.status === 404)
      return 'Сессия завершилась или срок её действия истёк. Начните заново.';
    if (error.code === 'TORRENT_SESSION_CHANGED')
      return 'Состояние торрента изменилось. Обновите данные и повторите действие.';
    if (error.code === 'TORRENT_CAPACITY_EXCEEDED' || error.code === 'TORRENT_RESOURCE_LIMIT')
      return 'Сервис сейчас занят. Попробуйте позже.';
    if (error.status === 503 || error.kind === 'network')
      return 'Торрент-сервис временно недоступен. Попробуйте позже.';
  }
  return `Не удалось ${action}. Попробуйте снова.`;
}

function preparationLabel(session: TorrentSession): string {
  switch (session.state) {
    case 'created':
      return 'Подключаем торрент-сервис…';
    case 'fetching_metadata':
      return 'Получаем данные раздачи…';
    case 'probing':
      return 'Проверяем видеофайл…';
    case 'preparing':
      return 'Готовим видео к просмотру…';
    case 'awaiting_playback':
      return 'Файл готов к следующему этапу просмотра.';
    case 'ready':
      return 'Видео подготовлено к просмотру.';
    default:
      return 'Подготовка торрента';
  }
}

export function TorrentLaunch({
  mediaRef,
  season,
  episode,
  activeSession,
  resumePositionSeconds,
  onPlaybackReady,
  onSessionChange,
  open,
  onOpenChange,
  onSourceSelect,
  playRequest = 0,
  onPlaybackError,
  selected = false,
}: {
  selected?: boolean;
  onSourceSelect?: () => void;
  playRequest?: number;
  onPlaybackError?: (message: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaRef: string;
  season?: number;
  episode?: number;
  activeSession: TorrentSession | null;
  resumePositionSeconds: number;
  onPlaybackReady: (session: TorrentSession) => void;
  onSessionChange: (session: TorrentSession | null) => void;
}) {
  const { state: authState, refresh } = useAuth();
  const accountKey = authState.status === 'authenticated' ? authState.user.email : 'inactive';
  const queryClient = useQueryClient();
  const [candidateSort, setCandidateSort] = useState<CandidateSort>('best');
  const [candidateFilters, setCandidateFilters] = useState<CandidateFilters>(emptyCandidateFilters);
  const panelRef = useRef<HTMLElement>(null);
  const magnetInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualDetailsRef = useRef<HTMLDetailsElement>(null);
  const profileQuery = useQuery({
    ...privateProfileQueryOptions(accountKey),
    enabled: open && authState.status === 'authenticated',
  });
  const [inputKind, setInputKind] = useState<'magnet' | 'file'>('magnet');
  const [magnet, setMagnet] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<TorrentSession | null>(null);
  const [selectedCandidateRef, setSelectedCandidateRef] = useState<string | null>(null);
  const [fileRef, setFileRef] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const createKeyRef = useRef<string | null>(null);
  const candidateKeyRef = useRef<{ ref: string; key: string } | null>(null);
  const playbackKeyRef = useRef<string | null>(null);
  const playbackRequestedRef = useRef(false);
  const previousPlayRequest = useRef(playRequest);
  const waitingForPlayback = useRef(false);
  const previousAccountRef = useRef(accountKey);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const activeQuery = useQuery({
    ...activeTorrentSessionQueryOptions(accountKey, mediaRef),
    enabled:
      open && authState.status === 'authenticated' && profileQuery.data?.emailVerified === true,
  });
  const sessionQuery = useQuery({
    ...torrentSessionQueryOptions(accountKey, session?.id ?? 'inactive'),
    enabled: authState.status === 'authenticated' && !!session,
  });
  const currentSession = session ? (sessionQuery.data ?? session) : null;
  const discoveryQuery = useQuery({
    queryKey: ['account', accountKey, 'torrent-discovery', mediaRef, season, episode],
    queryFn: ({ signal }) => getTorrentCandidates(mediaRef, season, episode, signal),
    enabled:
      open && authState.status === 'authenticated' && profileQuery.data?.emailVerified === true,
    staleTime: 60_000,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const allCandidates = discoveryQuery.data?.candidates ?? [];
  const visibleCandidates = selectCandidates(allCandidates, candidateSort, candidateFilters);
  const hasCandidateFilters = Object.values(candidateFilters).some(Boolean);
  const updateCandidateFilter = (key: keyof CandidateFilters, value: string | boolean) => {
    setCandidateFilters((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    setCandidateSort('best');
    setCandidateFilters(emptyCandidateFilters);
  }, [accountKey, mediaRef, season, episode]);

  useEffect(() => {
    if (!pending && !session && activeSession && activeSession.mediaRef === mediaRef)
      setSession(activeSession);
  }, [activeSession, mediaRef, pending, session]);

  useEffect(() => {
    if (!pending && !session && activeQuery.data?.mediaRef === mediaRef)
      setSession(activeQuery.data);
  }, [activeQuery.data, mediaRef, pending, session]);

  useEffect(() => {
    if (!pending && session && sessionQuery.data?.id === session.id)
      onSessionChange(sessionQuery.data);
  }, [onSessionChange, pending, session, sessionQuery.data]);

  useEffect(() => {
    if (
      pending ||
      !session ||
      !(sessionQuery.error instanceof TorrentRequestError) ||
      sessionQuery.error.status !== 404
    )
      return;
    setSession(null);
    setFileRef(null);
    waitingForPlayback.current = false;
    playbackRequestedRef.current = false;
    queryClient.setQueryData(torrentSessionQueryKeys.active(accountKey, mediaRef), null);
    onSessionChange(null);
  }, [accountKey, mediaRef, onSessionChange, pending, queryClient, session, sessionQuery.error]);

  useEffect(() => {
    if (!selected) {
      waitingForPlayback.current = false;
      playbackRequestedRef.current = false;
    }
  }, [selected]);

  useEffect(() => {
    if (
      selected &&
      playbackRequestedRef.current &&
      currentSession?.state === 'ready' &&
      currentSession.playback
    ) {
      playbackRequestedRef.current = false;
      onPlaybackReady(currentSession);
    }
  }, [currentSession, selected, onPlaybackReady]);

  useRestoreSocialAction('torrent', () => onOpenChange(true));

  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (previousAccountRef.current === accountKey) return;
    previousAccountRef.current = accountKey;
    requestRef.current?.abort();
    setSession(null);
    setSelectedCandidateRef(null);
    onSessionChange(null);
    setFileRef(null);
    setError(null);
    setPending(false);
    setMagnet('');
    setFile(null);
    createKeyRef.current = null;
    candidateKeyRef.current = null;
    playbackKeyRef.current = null;
    playbackRequestedRef.current = false;
  }, [accountKey, onSessionChange]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const stopPrevious = async (signal: AbortSignal) => {
    let previous = session ?? activeQuery.data ?? activeSession;
    if (!previous && activeQuery.isError) {
      const refreshed = await activeQuery.refetch();
      if (refreshed.error) throw refreshed.error;
      previous = refreshed.data ?? null;
    }
    waitingForPlayback.current = false;
    playbackRequestedRef.current = false;
    playbackKeyRef.current = null;
    if (!previous) return;
    await queryClient.cancelQueries({
      queryKey: torrentSessionQueryKeys.session(accountKey, previous.id),
    });
    try {
      await stopTorrentSession(previous.id, signal);
    } catch (cause) {
      if (!(cause instanceof TorrentRequestError) || cause.status !== 404) throw cause;
    }
    signal.throwIfAborted();
    setSession(null);
    setFileRef(null);
    setSelectedCandidateRef(null);
    queryClient.setQueryData(torrentSessionQueryKeys.active(accountKey, mediaRef), null);
    onSessionChange(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || authState.status !== 'authenticated' || !profileQuery.data?.emailVerified)
      return;
    const value = magnet.trim();
    if (
      inputKind === 'magnet' &&
      (!value.startsWith('magnet:?') || new TextEncoder().encode(value).length > maxMagnetBytes)
    ) {
      setError('Введите magnet-ссылку длиной до 4096 байт.');
      return;
    }
    if (inputKind === 'file' && (!file || file.size > maxTorrentFileBytes)) {
      setError('Выберите файл .torrent размером до 2 МиБ.');
      return;
    }

    const controller = new AbortController();
    const createKey = (createKeyRef.current ??= newTorrentIdempotencyKey());
    requestRef.current = controller;
    setPending(true);
    setError(null);
    try {
      await stopPrevious(controller.signal);
      const created =
        inputKind === 'magnet'
          ? await createMagnetSession(value, createKey, controller.signal, mediaRef)
          : await createFileSession(file!, createKey, controller.signal, mediaRef);
      if (controller.signal.aborted) return;
      cacheTorrentSession(queryClient, accountKey, created);
      queryClient.setQueryData(torrentSessionQueryKeys.active(accountKey, mediaRef), created);
      setSession(created);
      onSessionChange(created);
      onSourceSelect?.();
      setFileRef(null);
      createKeyRef.current = null;
    } catch (cause) {
      if (!controller.signal.aborted) setError(describeCreateError(cause));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  };

  const chooseCandidate = async (candidate: TorrentCandidate) => {
    if (
      pending ||
      authState.status !== 'authenticated' ||
      profileQuery.data?.emailVerified !== true
    )
      return;
    if (
      selected &&
      selectedCandidateRef === candidate.candidateRef &&
      currentSession?.state !== 'failed'
    )
      return;
    if (!discoveryQuery.data || Date.now() >= discoveryQuery.data.expiresAt) {
      setError('Результаты поиска устарели. Обновите список и выберите раздачу снова.');
      void discoveryQuery.refetch();
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    const key =
      candidateKeyRef.current?.ref === candidate.candidateRef
        ? candidateKeyRef.current.key
        : newTorrentIdempotencyKey();
    candidateKeyRef.current = { ref: candidate.candidateRef, key };
    setPending(true);
    setError(null);
    try {
      await stopPrevious(controller.signal);
      const created = await createCandidateSession(candidate.candidateRef, key, controller.signal);
      if (controller.signal.aborted) return;
      cacheTorrentSession(queryClient, accountKey, created);
      queryClient.setQueryData(torrentSessionQueryKeys.active(accountKey, mediaRef), created);
      setSession(created);
      setSelectedCandidateRef(candidate.candidateRef);
      onSessionChange(created);
      onSourceSelect?.();
      setFileRef(null);
      candidateKeyRef.current = null;
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof TorrentRequestError && cause.status === 404
            ? 'Раздача больше недоступна. Обновите поиск и выберите другую.'
            : cause instanceof TorrentRequestError && cause.code === 'TORRENT_CANDIDATE_UNSAFE'
              ? 'Файл раздачи не прошёл проверку. Выберите другую раздачу.'
              : describeCreateError(cause),
        );
        if (cause instanceof TorrentRequestError && cause.status === 404)
          void discoveryQuery.refetch();
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  };

  const chooseFile = async () => {
    if (!currentSession || !fileRef || pending) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    setError(null);
    try {
      await queryClient.cancelQueries({
        queryKey: torrentSessionQueryKeys.session(accountKey, currentSession.id),
      });
      const updated = await selectTorrentFile(
        currentSession.id,
        fileRef,
        currentSession.version,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      cacheTorrentSession(queryClient, accountKey, updated);
      setSession(updated);
      onSourceSelect?.();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(describeCommandError(cause, 'выбрать файл'));
        void sessionQuery.refetch();
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  };

  const play = async () => {
    if (!currentSession || pending || sessionQuery.isError) return;
    const savedPosition =
      Number.isFinite(resumePositionSeconds) && resumePositionSeconds > 0
        ? resumePositionSeconds
        : 0;
    const duration = currentSession.playback?.durationSeconds;
    const startPositionSeconds =
      duration !== null && duration !== undefined && savedPosition >= duration ? 0 : savedPosition;
    if (
      currentSession.state === 'ready' &&
      currentSession.playback &&
      Math.abs(currentSession.playback.startPositionSeconds - startPositionSeconds) < 10
    ) {
      onPlaybackReady(currentSession);
      return;
    }
    if (currentSession.state !== 'awaiting_playback' && currentSession.state !== 'ready') return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    setError(null);
    const key = (playbackKeyRef.current ??= newTorrentIdempotencyKey());
    try {
      await queryClient.cancelQueries({
        queryKey: torrentSessionQueryKeys.session(accountKey, currentSession.id),
      });
      const updated = await startTorrentPlayback(
        currentSession.id,
        startPositionSeconds,
        currentSession.version,
        key,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      playbackRequestedRef.current = selectedRef.current;
      playbackKeyRef.current = null;
      cacheTorrentSession(queryClient, accountKey, updated);
      setSession(updated);
      onSessionChange(updated);
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = describeCommandError(cause, 'подготовить воспроизведение');
        setError(message);
        onPlaybackError?.(message);
        void sessionQuery.refetch();
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  };

  const requestPlay = useEffectEvent(() => {
    if (!currentSession || pending) return;
    if (sessionQuery.isError) {
      waitingForPlayback.current = false;
      const message = describeCommandError(sessionQuery.error, 'получить состояние торрента');
      setError(message);
      onPlaybackError?.(message);
      return;
    }
    if (currentSession.state === 'awaiting_file') {
      onOpenChange(true);
      return;
    }
    if (currentSession.state === 'failed') {
      waitingForPlayback.current = false;
      onPlaybackError?.(describeFailure(currentSession));
      return;
    }
    if (currentSession.state === 'awaiting_playback' || currentSession.state === 'ready') {
      waitingForPlayback.current = false;
      void play();
    }
  });

  useEffect(() => {
    if (playRequest !== previousPlayRequest.current) {
      previousPlayRequest.current = playRequest;
      waitingForPlayback.current = true;
    }
    if (waitingForPlayback.current) requestPlay();
  }, [playRequest, currentSession, pending, sessionQuery.error]);

  if (!open) return null;

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-label="Просмотр торрента"
      className="min-w-0 outline-none"
    >
      {open && (
        <div className="space-y-3">
          {authState.status === 'guest' ? (
            <SocialLoginLink intent="torrent" className="font-semibold text-action hover:underline">
              Войти и вернуться к просмотру
            </SocialLoginLink>
          ) : authState.status === 'error' ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-error">
                Не удалось проверить сессию входа.
              </p>
              <Button variant="secondary" size="small" onClick={() => void refresh()}>
                Повторить
              </Button>
            </div>
          ) : authState.status === 'authenticated' && profileQuery.isError ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-error">
                Не удалось проверить доступ.
              </p>
              <Button variant="secondary" size="small" onClick={() => void profileQuery.refetch()}>
                Повторить
              </Button>
            </div>
          ) : authState.status === 'authenticated' && profileQuery.data?.emailVerified === false ? (
            <div className="space-y-3 text-sm text-text-secondary">
              <p>
                Подтвердите email, чтобы смотреть торрент. После подтверждения обновите страницу.
              </p>
              <ResendVerification email={profileQuery.data.email} />
            </div>
          ) : authState.status === 'authenticated' && profileQuery.data?.emailVerified ? (
            <div className="space-y-4">
              {currentSession?.state === 'awaiting_file' && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-text-primary">
                    Выберите видеофайл
                  </legend>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {currentSession.files.map((item) => (
                      <label
                        key={item.ref}
                        className="flex cursor-pointer items-start gap-3 rounded-control border border-border px-3 py-2 text-sm text-text-primary"
                      >
                        <input
                          type="radio"
                          name="torrent-file"
                          value={item.ref}
                          checked={fileRef === item.ref}
                          onChange={() => setFileRef(item.ref)}
                          className="mt-1"
                        />
                        <span className="min-w-0 break-words">
                          {item.name}{' '}
                          <span className="text-text-secondary">
                            ({formatBytes(item.sizeBytes)})
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <Button
                    size="small"
                    disabled={!fileRef || pending || sessionQuery.isError}
                    onClick={() => void chooseFile()}
                  >
                    {pending ? 'Выбираем…' : 'Подтвердить выбор'}
                  </Button>
                </fieldset>
              )}
              <div className="space-y-3" aria-label="Найденные раздачи">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-text-primary">Найденные раздачи</h3>
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={discoveryQuery.isFetching}
                    onClick={() => {
                      setError(null);
                      candidateKeyRef.current = null;
                      void discoveryQuery.refetch();
                    }}
                  >
                    Обновить
                  </Button>
                </div>
                {discoveryQuery.isPending || (discoveryQuery.isFetching && !discoveryQuery.data) ? (
                  <Spinner size="small" label="Ищем раздачи" />
                ) : discoveryQuery.isError ? (
                  <p role="alert" className="text-sm text-error">
                    Поиск сейчас недоступен. Повторите попытку или добавьте торрент вручную.
                  </p>
                ) : discoveryQuery.data ? (
                  <>
                    {discoveryQuery.data.candidates.length === 0 ? (
                      <p className="text-sm text-text-secondary">
                        Подходящих раздач не найдено. Попробуйте обновить поиск или добавить торрент
                        вручную.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2 rounded-control bg-control/50 p-2 min-[480px]:grid-cols-3">
                          <div className="min-w-0 text-xs text-text-secondary">
                            <span>Сортировка</span>
                            <Select
                              aria-label="Сортировка"
                              value={candidateSort}
                              onChange={(value) => setCandidateSort(value as CandidateSort)}
                              allowEmpty={false}
                              matchMenuWidth
                              placeholder="Лучшие"
                              options={[
                                { value: 'best', label: 'Лучшие' },
                                { value: 'newest', label: 'Сначала новые' },
                                { value: 'seeders', label: 'Больше раздающих' },
                              ]}
                              className="mt-1 block w-full min-w-0 [&>button]:min-h-8 [&>button]:min-w-0 [&>button]:px-2 [&>button]:text-xs"
                            />
                          </div>
                          {(['tracker', 'resolution', 'quality', 'voice'] as const).map((field) => (
                            <div key={field} className="min-w-0 text-xs text-text-secondary">
                              <span>
                                {
                                  {
                                    tracker: 'Источник',
                                    resolution: 'Разрешение',
                                    quality: 'Качество',
                                    voice: 'Озвучка',
                                  }[field]
                                }
                              </span>
                              <Select
                                aria-label={
                                  {
                                    tracker: 'Источник раздачи',
                                    resolution: 'Разрешение',
                                    quality: 'Качество',
                                    voice: 'Озвучка',
                                  }[field]
                                }
                                value={candidateFilters[field] || null}
                                onChange={(value) => updateCandidateFilter(field, value ?? '')}
                                placeholder="Все"
                                matchMenuWidth
                                options={candidateOptions(allCandidates, field).map(
                                  ({ value, count }) => ({
                                    value,
                                    label: `${field === 'tracker' ? candidateTrackerLabel(value) : value} (${count})`,
                                  }),
                                )}
                                className="mt-1 block w-full min-w-0 [&>button]:min-h-8 [&>button]:min-w-0 [&>button]:px-2 [&>button]:text-xs"
                              />
                            </div>
                          ))}
                          {allCandidates.some((item) => item.seeders !== null) && (
                            <label className="flex items-center gap-2 self-end py-2 text-sm text-text-primary">
                              <input
                                type="checkbox"
                                checked={candidateFilters.seededOnly}
                                onChange={(event) =>
                                  updateCandidateFilter('seededOnly', event.target.checked)
                                }
                              />
                              Только с раздающими
                            </label>
                          )}
                        </div>
                        <div
                          className="flex flex-wrap items-center gap-3 text-sm text-text-secondary"
                          role="status"
                        >
                          <span>
                            Показано {visibleCandidates.length} из {allCandidates.length} ·{' '}
                            {
                              {
                                best: 'Лучшие',
                                newest: 'Сначала новые',
                                seeders: 'Больше раздающих',
                              }[candidateSort]
                            }
                          </span>
                          {hasCandidateFilters && (
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => setCandidateFilters(emptyCandidateFilters)}
                            >
                              Сбросить фильтры
                            </Button>
                          )}
                        </div>
                        {visibleCandidates.length === 0 && (
                          <p className="text-sm text-text-secondary">
                            Варианты скрыты выбранными фильтрами. Сбросьте фильтры или обновите
                            поиск.
                          </p>
                        )}
                        <div className="space-y-2">
                          {visibleCandidates.map((candidate) => (
                            <CandidateCard
                              key={candidate.candidateRef}
                              candidate={candidate}
                              pending={pending || activeQuery.isPending}
                              selected={selected && selectedCandidateRef === candidate.candidateRef}
                              status={
                                selected &&
                                selectedCandidateRef === candidate.candidateRef &&
                                currentSession
                                  ? currentSession.state === 'ready'
                                    ? 'Сейчас воспроизводится'
                                    : preparationLabel(currentSession)
                                  : undefined
                              }
                              onSelect={() => void chooseCandidate(candidate)}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                ) : null}
              </div>
              <details ref={manualDetailsRef} className="rounded-control border border-border p-3">
                <summary className="cursor-pointer font-semibold text-text-primary">
                  Добавить вручную
                </summary>
                <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
                  <fieldset className="flex flex-wrap gap-4 text-sm text-text-primary">
                    <legend className="mb-2 font-semibold">Источник торрента</legend>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="torrent-input"
                        checked={inputKind === 'magnet'}
                        onChange={() => {
                          setInputKind('magnet');
                          setError(null);
                          createKeyRef.current = null;
                        }}
                      />
                      Magnet-ссылка
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="torrent-input"
                        checked={inputKind === 'file'}
                        onChange={() => {
                          setInputKind('file');
                          setError(null);
                          createKeyRef.current = null;
                        }}
                      />
                      Файл .torrent
                    </label>
                  </fieldset>
                  {inputKind === 'magnet' ? (
                    <label className="block space-y-2 text-sm font-semibold text-text-primary">
                      <span>Magnet-ссылка</span>
                      <textarea
                        ref={magnetInputRef}
                        rows={3}
                        value={magnet}
                        onChange={(event) => {
                          setMagnet(event.target.value);
                          setError(null);
                          createKeyRef.current = null;
                        }}
                        placeholder="magnet:?xt=urn:btih:…"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoComplete="off"
                        className="w-full resize-y rounded-control border border-border bg-surface px-3 py-2 font-normal text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
                      />
                    </label>
                  ) : (
                    <label className="block space-y-2 text-sm font-semibold text-text-primary">
                      <span>Файл .torrent (до 2 МиБ)</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".torrent,application/x-bittorrent"
                        onChange={(event) => {
                          setFile(event.target.files?.[0] ?? null);
                          setError(null);
                          createKeyRef.current = null;
                        }}
                        className="block w-full text-sm font-normal"
                      />
                    </label>
                  )}
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Запускаем…' : 'Запустить'}
                  </Button>
                </form>
              </details>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">Проверяем доступ…</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
