import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

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
import { Button, Spinner } from '@/shared';
import {
  candidateOptions,
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

const reasonLabels: Record<string, string> = {
  title_match: 'совпадение названия',
  title_mismatch: 'название может не совпадать',
  year_match: 'совпадение года',
  year_mismatch: 'другой год',
  season_match: 'совпадение сезона',
  season_mismatch: 'другой сезон',
  episode_match: 'совпадение серии',
  episode_mismatch: 'другая серия',
  quality_label: 'указано качество',
  low_quality: 'низкое качество',
  russian_voice_claim: 'заявлена русская озвучка',
  studio_claim: 'указана студия',
  russian_subtitles_claim: 'заявлены русские субтитры',
  seeders: 'есть раздающие',
  no_seeders: 'нет раздающих',
  large_size: 'большой размер',
  recent: 'недавняя публикация',
  suspicious_title: 'подозрительное название',
  type_mismatch: 'другой тип',
};

function CandidateCard({
  candidate,
  pending,
  onSelect,
}: {
  candidate: TorrentCandidate;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <article className="min-w-0 space-y-2 rounded-control border border-border p-3 text-sm">
      <p className="break-words font-semibold text-text-primary">{candidate.title}</p>
      <p className="text-text-secondary">
        {candidate.tracker} · {formatBytes(candidate.size)} · Раздающих:{' '}
        {candidate.seeders ?? 'нет данных'}
        {candidate.publishedAt &&
          ` · Опубликовано: ${new Date(candidate.publishedAt).toLocaleDateString('ru-RU')}`}
      </p>
      <p className="text-text-secondary">
        {[candidate.resolution, candidate.quality, candidate.voice, candidate.studio]
          .filter(Boolean)
          .join(' · ') || 'Качество и озвучка не указаны'}
        {candidate.russianSubtitles ? ' · заявлены русские субтитры' : ''}
      </p>
      {candidate.reasons.length > 0 && (
        <p className="text-xs text-text-secondary">
          Порядок: {candidate.reasons.map((reason) => reasonLabels[reason] ?? reason).join(', ')}
        </p>
      )}
      <Button size="small" disabled={pending} onClick={onSelect}>
        {pending ? 'Запускаем…' : 'Выбрать раздачу'}
      </Button>
    </article>
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
}: {
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
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [candidateSort, setCandidateSort] = useState<CandidateSort>('best');
  const [candidateFilters, setCandidateFilters] = useState<CandidateFilters>(emptyCandidateFilters);
  const panelId = useId();
  const magnetInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const manualDetailsRef = useRef<HTMLDetailsElement>(null);
  const manualSourceRef = useRef(false);
  const profileQuery = useQuery({
    ...privateProfileQueryOptions(accountKey),
    enabled: open && authState.status === 'authenticated',
  });
  const [inputKind, setInputKind] = useState<'magnet' | 'file'>('magnet');
  const [magnet, setMagnet] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<TorrentSession | null>(null);
  const [fileRef, setFileRef] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const createKeyRef = useRef<string | null>(null);
  const candidateKeyRef = useRef<{ ref: string; key: string } | null>(null);
  const playbackKeyRef = useRef<string | null>(null);
  const playbackRequestedRef = useRef(false);
  const previousAccountRef = useRef(accountKey);
  const activeQuery = useQuery({
    ...activeTorrentSessionQueryOptions(accountKey, mediaRef),
    enabled:
      open && authState.status === 'authenticated' && profileQuery.data?.emailVerified === true,
  });
  const sessionQuery = useQuery({
    ...torrentSessionQueryOptions(accountKey, session?.id ?? 'inactive'),
    enabled:
      (open || playbackRequestedRef.current) && authState.status === 'authenticated' && !!session,
  });
  const currentSession = session ? (sessionQuery.data ?? session) : null;
  const discoveryQuery = useQuery({
    queryKey: ['account', accountKey, 'torrent-discovery', mediaRef, season, episode],
    queryFn: ({ signal }) => getTorrentCandidates(mediaRef, season, episode, signal),
    enabled:
      open &&
      authState.status === 'authenticated' &&
      profileQuery.data?.emailVerified === true &&
      !session &&
      activeQuery.isSuccess &&
      !activeQuery.data,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const allCandidates = discoveryQuery.data?.candidates ?? [];
  const visibleCandidates = selectCandidates(allCandidates, candidateSort, candidateFilters);
  const hasCandidateFilters = Object.values(candidateFilters).some(Boolean);
  const updateCandidateFilter = (key: keyof CandidateFilters, value: string | boolean) => {
    setCandidateFilters((current) => ({ ...current, [key]: value }));
    setShowAll(false);
  };

  useEffect(() => {
    setCandidateSort('best');
    setCandidateFilters(emptyCandidateFilters);
    setShowAll(false);
  }, [accountKey, mediaRef, season, episode]);

  useEffect(() => {
    if (!session && activeSession && activeSession.mediaRef === mediaRef) setSession(activeSession);
  }, [activeSession, mediaRef, session]);

  useEffect(() => {
    if (!session && activeQuery.data?.mediaRef === mediaRef) setSession(activeQuery.data);
  }, [activeQuery.data, mediaRef, session]);

  useEffect(() => {
    if (session && sessionQuery.data?.id === session.id) onSessionChange(sessionQuery.data);
  }, [onSessionChange, session, sessionQuery.data]);

  useEffect(() => {
    if (
      playbackRequestedRef.current &&
      currentSession?.state === 'ready' &&
      currentSession.playback
    ) {
      playbackRequestedRef.current = false;
      onPlaybackReady(currentSession);
    }
  }, [currentSession, onPlaybackReady]);

  useRestoreSocialAction('torrent', () => setOpen(true));

  useEffect(() => {
    if (previousAccountRef.current === accountKey) return;
    previousAccountRef.current = accountKey;
    requestRef.current?.abort();
    setSession(null);
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      pending ||
      session ||
      authState.status !== 'authenticated' ||
      !profileQuery.data?.emailVerified
    )
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
      const created =
        inputKind === 'magnet'
          ? await createMagnetSession(value, createKey, controller.signal, mediaRef)
          : await createFileSession(file!, createKey, controller.signal, mediaRef);
      if (controller.signal.aborted) return;
      cacheTorrentSession(queryClient, accountKey, created);
      queryClient.setQueryData(torrentSessionQueryKeys.active(accountKey, mediaRef), created);
      setSession(created);
      manualSourceRef.current = true;
      onSessionChange(created);
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
    if (pending || session || authState.status !== 'authenticated') return;
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
      const created = await createCandidateSession(candidate.candidateRef, key, controller.signal);
      if (controller.signal.aborted) return;
      cacheTorrentSession(queryClient, accountKey, created);
      queryClient.setQueryData(torrentSessionQueryKeys.active(accountKey, mediaRef), created);
      setSession(created);
      manualSourceRef.current = false;
      onSessionChange(created);
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

  const focusAfterStop = () => {
    if (!manualSourceRef.current) return;
    requestAnimationFrame(() => {
      if (manualDetailsRef.current) manualDetailsRef.current.open = true;
      (inputKind === 'magnet' ? magnetInputRef.current : fileInputRef.current)?.focus();
    });
  };

  const stop = async () => {
    if (!session || pending) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    setError(null);
    try {
      await stopTorrentSession(session.id, controller.signal);
      if (controller.signal.aborted) return;
      setSession(null);
      queryClient.setQueryData(torrentSessionQueryKeys.active(accountKey, mediaRef), null);
      onSessionChange(null);
      setFileRef(null);
      setFile(null);
      playbackRequestedRef.current = false;
      focusAfterStop();
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof TorrentRequestError && cause.status === 404) {
          setSession(null);
          queryClient.setQueryData(torrentSessionQueryKeys.active(accountKey, mediaRef), null);
          onSessionChange(null);
          setFileRef(null);
          setFile(null);
          focusAfterStop();
        } else setError(describeCommandError(cause, 'остановить сессию'));
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
      const updated = await selectTorrentFile(
        currentSession.id,
        fileRef,
        currentSession.version,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      cacheTorrentSession(queryClient, accountKey, updated);
      setSession(updated);
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
      const updated = await startTorrentPlayback(
        currentSession.id,
        startPositionSeconds,
        currentSession.version,
        key,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      playbackRequestedRef.current = true;
      playbackKeyRef.current = null;
      cacheTorrentSession(queryClient, accountKey, updated);
      setSession(updated);
      onSessionChange(updated);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(describeCommandError(cause, 'подготовить воспроизведение'));
        void sessionQuery.refetch();
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPending(false);
      }
    }
  };

  return (
    <section
      aria-label="Просмотр торрента"
      className="rounded-card border border-context-border bg-surface p-4 shadow-surface sm:p-5"
    >
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        Смотреть торрент
      </Button>
      {open && (
        <div id={panelId} className="mt-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Поиск показывает раздачи из подключённых внешних источников. yaneMedia не предоставляет
            контент. Ваш IP-адрес может быть виден другим участникам раздачи. Одновременно доступен
            один просмотр; размер раздачи ограничен 200 ГиБ, видео — 30 ГиБ. Подготовка начинается
            только после выбора раздачи или ручного запуска.
          </p>
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
            currentSession ? (
              <div className="space-y-4">
                {sessionQuery.isError ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p role="alert" className="text-sm text-error">
                      {sessionQuery.error instanceof TorrentRequestError &&
                      sessionQuery.error.status === 404
                        ? 'Сессия завершилась или срок её действия истёк.'
                        : 'Не удалось получить новое состояние. Подготовка на сервере может продолжаться; ниже показаны последние данные.'}
                    </p>
                    {sessionQuery.error instanceof TorrentRequestError &&
                    sessionQuery.error.status === 404 ? (
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setSession(null);
                          queryClient.setQueryData(
                            torrentSessionQueryKeys.active(accountKey, mediaRef),
                            null,
                          );
                          onSessionChange(null);
                        }}
                      >
                        Начать заново
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => void sessionQuery.refetch()}
                      >
                        Обновить
                      </Button>
                    )}
                  </div>
                ) : null}
                {currentSession.state === 'failed' ? (
                  <p role="alert" className="text-sm text-error">
                    {describeFailure(currentSession)}
                  </p>
                ) : currentSession.state === 'awaiting_file' ? (
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
                ) : (
                  <div className="min-h-24 space-y-2 text-sm text-text-primary" role="status">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-semibold">{preparationLabel(currentSession)}</p>
                      {['created', 'fetching_metadata', 'probing', 'preparing'].includes(
                        currentSession.state,
                      ) &&
                        !sessionQuery.isError && (
                          <Spinner size="small" label="Подготовка продолжается" />
                        )}
                    </div>
                    {currentSession.state === 'fetching_metadata' &&
                      currentSession.progress.peers === 0 && (
                        <p className="text-text-secondary">
                          Пока нет подключённых участников. Поиск может занять несколько минут.
                        </p>
                      )}
                    {['created', 'fetching_metadata', 'probing', 'preparing'].includes(
                      currentSession.state,
                    ) && (
                      <p className="tabular-nums text-text-secondary">
                        {currentSession.progress.basisPoints === null
                          ? 'Прогресс: ожидаем данные'
                          : `Прогресс: ${(currentSession.progress.basisPoints / 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`}
                        {' · '}Участники: {currentSession.progress.peers}
                        {' · '}Скорость: {formatBytes(currentSession.progress.speedBytesPerSecond)}
                        /с
                      </p>
                    )}
                  </div>
                )}
                {(currentSession.state === 'awaiting_playback' ||
                  currentSession.state === 'ready') && (
                  <div className="space-y-2">
                    <Button
                      size="small"
                      disabled={pending || sessionQuery.isError}
                      onClick={() => void play()}
                    >
                      {pending ? 'Запускаем…' : 'Воспроизвести'}
                    </Button>
                    <p className="text-xs text-text-secondary">
                      В первом выпуске используется аудиодорожка по умолчанию; выбор субтитров
                      недоступен.
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={pending}
                    onClick={() => void stop()}
                  >
                    {pending
                      ? 'Останавливаем…'
                      : currentSession.state === 'failed'
                        ? 'Начать заново'
                        : 'Остановить сессию'}
                  </Button>
                </div>
              </div>
            ) : activeQuery.isPending ? (
              <Spinner size="small" label="Проверяем активную сессию торрента" />
            ) : activeQuery.isError ? (
              <div className="flex flex-wrap items-center gap-3">
                <p role="alert" className="text-sm text-error">
                  Не удалось проверить активную сессию.
                </p>
                <Button variant="secondary" size="small" onClick={() => void activeQuery.refetch()}>
                  Повторить
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
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
                      Обновить поиск
                    </Button>
                  </div>
                  {discoveryQuery.isPending ||
                  (discoveryQuery.isFetching && !discoveryQuery.data) ? (
                    <Spinner size="small" label="Ищем раздачи" />
                  ) : discoveryQuery.isError ? (
                    <p role="alert" className="text-sm text-error">
                      Поиск сейчас недоступен. Повторите попытку или добавьте торрент вручную.
                    </p>
                  ) : discoveryQuery.data ? (
                    <>
                      {discoveryQuery.data.degraded && (
                        <p role="status" className="text-sm text-text-secondary">
                          Часть источников не ответила. Показаны доступные результаты.
                        </p>
                      )}
                      {discoveryQuery.data.candidates.length === 0 ? (
                        <p className="text-sm text-text-secondary">
                          Подходящих раздач не найдено. Попробуйте обновить поиск или добавить
                          торрент вручную.
                        </p>
                      ) : (
                        <>
                          <p className="text-xs text-text-secondary">
                            Название, качество и озвучка заявлены внешним источником. После проверки
                            файла фактические аудиодорожки могут отличаться.
                          </p>
                          <div className="grid gap-2 rounded-control border border-border p-3 sm:grid-cols-2 xl:grid-cols-3">
                            <label className="text-sm text-text-primary">
                              Сортировка
                              <select
                                value={candidateSort}
                                onChange={(event) =>
                                  setCandidateSort(event.target.value as CandidateSort)
                                }
                                className="mt-1 block w-full rounded-control border border-border bg-surface px-2 py-2 text-text-primary"
                              >
                                <option value="best">Лучшие</option>
                                <option value="newest">Сначала новые</option>
                                <option value="seeders">Больше раздающих</option>
                              </select>
                            </label>
                            {(['tracker', 'resolution', 'quality', 'voice'] as const).map(
                              (field) => (
                                <label key={field} className="text-sm text-text-primary">
                                  {
                                    {
                                      tracker: 'Источник',
                                      resolution: 'Разрешение',
                                      quality: 'Качество',
                                      voice: 'Озвучка',
                                    }[field]
                                  }
                                  <select
                                    value={candidateFilters[field]}
                                    onChange={(event) =>
                                      updateCandidateFilter(field, event.target.value)
                                    }
                                    className="mt-1 block w-full rounded-control border border-border bg-surface px-2 py-2 text-text-primary"
                                  >
                                    <option value="">Все</option>
                                    {candidateOptions(allCandidates, field).map(
                                      ({ value, count }) => (
                                        <option key={value} value={value}>
                                          {value} ({count})
                                        </option>
                                      ),
                                    )}
                                  </select>
                                </label>
                              ),
                            )}
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
                            {visibleCandidates
                              .slice(0, showAll ? undefined : 5)
                              .map((candidate) => (
                                <CandidateCard
                                  key={candidate.candidateRef}
                                  candidate={candidate}
                                  pending={pending}
                                  onSelect={() => void chooseCandidate(candidate)}
                                />
                              ))}
                          </div>
                          {visibleCandidates.length > 5 && (
                            <Button
                              variant="secondary"
                              size="small"
                              onClick={() => setShowAll((current) => !current)}
                            >
                              {showAll
                                ? 'Скрыть остальные'
                                : `Показать остальные (${visibleCandidates.length - 5})`}
                            </Button>
                          )}
                        </>
                      )}
                    </>
                  ) : null}
                </div>
                <details
                  ref={manualDetailsRef}
                  className="rounded-control border border-border p-3"
                >
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
            )
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
