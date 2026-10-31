import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { logout, useAuth } from '@/entities/auth';
import {
  stopTorrentSession,
  torrentSessionQueryKeys,
  type TorrentSession,
} from '@/entities/torrent-session';
import { SocialLoginLink } from '@/features/social-access';
import { privateProfileQueryOptions } from '@/features/social-data';
import { Button, ExitIcon, Popover, ProfileIcon } from '@/shared';
import { ApiClientError } from '@/shared/api';

type AccountControlProps = {
  profilePath: string;
  placement?: 'top' | 'bottom';
};

const triggerClassName = [
  'relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-control',
  'border border-navigation-border bg-background text-text-primary',
  'transition-[background-color,border-color,color,transform] duration-200 ease-out',
  'hover:border-watermark/70 hover:bg-navigation-active active:scale-95',
  'aria-expanded:border-action/40 aria-expanded:bg-navigation-active aria-expanded:text-navigation-active-text',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30',
  'motion-reduce:transform-none motion-reduce:transition-none',
].join(' ');

export function AccountControl({ profilePath, placement = 'bottom' }: AccountControlProps) {
  const queryClient = useQueryClient();
  const { state, setGuest, refresh } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const accountKey = state.status === 'authenticated' ? state.user.email : '';
  const profileQuery = useQuery({
    ...privateProfileQueryOptions(accountKey),
    enabled: state.status === 'authenticated',
  });
  const [hasAvatarError, setHasAvatarError] = useState(false);
  const avatarUrl = profileQuery.data?.avatarUrl ?? null;

  useEffect(() => setHasAvatarError(false), [avatarUrl]);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      const knownSessions = queryClient.getQueriesData<TorrentSession | null>({
        queryKey: torrentSessionQueryKeys.root(accountKey),
      });
      const sessionIds = new Set(
        knownSessions.map(([, session]) => session?.id).filter((id): id is string => !!id),
      );
      await Promise.allSettled(
        [...sessionIds].map((id) => stopTorrentSession(id, AbortSignal.timeout(5_000))),
      );
      await logout();
      setGuest();
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.status === 401) {
        setGuest();
      } else {
        setLogoutError('Не удалось выйти. Попробуйте ещё раз.');
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <button
        type="button"
        className={triggerClassName}
        aria-label="Проверяем сессию"
        aria-busy="true"
        disabled
      >
        <ProfileIcon className="size-5 animate-pulse motion-reduce:animate-none" />
      </button>
    );
  }

  if (state.status === 'guest') {
    return (
      <SocialLoginLink
        intent="profile"
        returnTo={profilePath}
        ariaLabel="Войти и открыть личный профиль"
        className={triggerClassName}
      >
        <ProfileIcon className="size-5" />
      </SocialLoginLink>
    );
  }

  return (
    <Popover
      trigger={
        avatarUrl && !hasAvatarError ? (
          <img
            src={avatarUrl}
            alt=""
            className="size-full object-cover"
            onError={() => setHasAvatarError(true)}
          />
        ) : (
          <ProfileIcon className="size-5" />
        )
      }
      triggerLabel={
        state.status === 'authenticated'
          ? `Аккаунт: ${state.user.displayName}`
          : 'Ошибка проверки сессии'
      }
      triggerSize="custom"
      triggerVariant="bare"
      triggerClassName={triggerClassName}
      align="end"
      side={placement}
      panelClassName={[
        placement === 'top' ? 'w-52' : 'w-60',
        'max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto',
        'rounded-overlay bg-popover p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      ].join(' ')}
    >
      {(closePopover) => (
        <div className={state.status === 'error' ? 'flex flex-col gap-3 p-2' : 'flex flex-col'}>
          {state.status === 'error' ? (
            <>
              <p role="alert" className="text-sm text-error">
                Не удалось проверить сессию.
              </p>
              <Button size="small" variant="secondary" onClick={() => void refresh()}>
                Повторить
              </Button>
            </>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-3 rounded-control border border-border bg-background/50 p-2">
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-watermark/10 text-accent-text">
                  {avatarUrl && !hasAvatarError ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="size-full object-cover"
                      onError={() => setHasAvatarError(true)}
                    />
                  ) : (
                    <ProfileIcon aria-hidden="true" className="size-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {state.user.displayName}
                  </p>
                </div>
              </div>

              <div className="my-2 h-px bg-border" />

              <Link
                to={profilePath}
                className="flex min-h-10 items-center gap-3 rounded-control px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                onClick={closePopover}
              >
                <ProfileIcon aria-hidden="true" className="size-5 shrink-0 text-text-secondary" />
                Личный профиль
              </Link>

              <Button
                variant="bare"
                size="custom"
                className="min-h-10 w-full justify-start gap-3 px-3 text-sm text-text-secondary hover:bg-interactive-hover hover:text-text-primary focus-visible:ring-action/30"
                disabled={isLoggingOut}
                onClick={handleLogout}
              >
                <ExitIcon aria-hidden="true" className="size-5 shrink-0" />
                {isLoggingOut ? 'Выходим…' : 'Выйти'}
              </Button>

              {logoutError && (
                <p role="alert" className="px-3 pt-2 text-xs text-error">
                  {logoutError}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Popover>
  );
}
