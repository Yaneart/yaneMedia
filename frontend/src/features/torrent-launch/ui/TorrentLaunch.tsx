import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { useAuth } from '@/entities/auth';
import {
  cacheTorrentSession,
  createFileSession,
  createMagnetSession,
  newTorrentIdempotencyKey,
  stopTorrentSession,
  TorrentRequestError,
  type TorrentSession,
} from '@/entities/torrent-session';
import { ResendVerification } from '@/features/auth-form';
import { privateProfileQueryOptions } from '@/features/social-data';
import { SocialLoginLink, useRestoreSocialAction } from '@/features/social-access';
import { Button } from '@/shared';

const maxTorrentFileBytes = 2 * 1024 * 1024;
const maxMagnetBytes = 4096;

function describeCreateError(error: unknown): string {
  if (!(error instanceof TorrentRequestError))
    return 'Не удалось создать сессию. Попробуйте снова.';
  if (error.code === 'TORRENT_ACTIVE_SESSION_EXISTS')
    return 'У вас уже есть активный торрент. Завершите его перед запуском нового.';
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

export function TorrentLaunch({ mediaRef }: { mediaRef: string }) {
  const { state: authState, refresh } = useAuth();
  const accountKey = authState.status === 'authenticated' ? authState.user.email : 'inactive';
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const profileQuery = useQuery({
    ...privateProfileQueryOptions(accountKey),
    enabled: open && authState.status === 'authenticated',
  });
  const [inputKind, setInputKind] = useState<'magnet' | 'file'>('magnet');
  const [magnet, setMagnet] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<TorrentSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const createKeyRef = useRef<string | null>(null);
  const previousAccountRef = useRef(accountKey);

  useRestoreSocialAction('torrent', () => setOpen(true));

  useEffect(() => {
    if (previousAccountRef.current === accountKey) return;
    previousAccountRef.current = accountKey;
    requestRef.current?.abort();
    setSession(null);
    setError(null);
    setPending(false);
    setMagnet('');
    setFile(null);
    createKeyRef.current = null;
  }, [accountKey]);

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
      setSession(created);
      setMagnet('');
      setFile(null);
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
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (cause instanceof TorrentRequestError && cause.status === 404) setSession(null);
        else setError('Не удалось остановить сессию. Попробуйте снова.');
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
        onClick={() => setOpen((current) => !current)}
      >
        Смотреть торрент
      </Button>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-text-secondary">
            Вы сами предоставляете magnet-ссылку или файл .torrent. yaneMedia не предоставляет
            контент. Ваш IP-адрес может быть виден другим участникам раздачи. Одновременно доступен
            один просмотр; размер раздачи ограничен 200 ГиБ, видео — 30 ГиБ. Подготовка не
            начинается до нажатия «Запустить».
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
            session ? (
              <div className="space-y-3" role="status">
                <p className="text-sm text-text-primary">
                  Сессия создана, подготовка торрента началась. Вы можете остановить её здесь.
                </p>
                <Button
                  variant="secondary"
                  size="small"
                  disabled={pending}
                  onClick={() => void stop()}
                >
                  {pending ? 'Останавливаем…' : 'Остановить сессию'}
                </Button>
              </div>
            ) : (
              <form onSubmit={(event) => void submit(event)} className="space-y-4">
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
