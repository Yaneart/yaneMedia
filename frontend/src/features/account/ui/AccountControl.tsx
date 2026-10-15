import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { logout, useAuth } from '@/entities/auth';
import { SocialLoginLink } from '@/features/social-access';
import { privateProfileQueryOptions } from '@/features/social-data';
import { Button, Popover, ProfileIcon } from '@/shared';
import { ApiClientError } from '@/shared/api';

type AccountControlProps = {
  profilePath: string;
  placement?: 'top' | 'bottom';
};

const triggerClassName = [
  'flex size-10 shrink-0 items-center justify-center rounded-control',
  'border border-navigation-border bg-background text-text-primary',
  'hover:bg-interactive-hover',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20',
].join(' ');

export function AccountControl({ profilePath, placement = 'bottom' }: AccountControlProps) {
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
            className="size-full rounded-control object-cover"
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
      className={
        placement === 'top' ? '[&>div]:top-auto [&>div]:bottom-full [&>div]:mt-0 [&>div]:mb-2' : ''
      }
      panelClassName={[
        placement === 'top' ? 'w-52 translate-x-11' : 'w-60',
        'max-w-[calc(100vw-2rem)] rounded-overlay bg-popover p-3',
      ].join(' ')}
    >
      <div className="flex flex-col gap-3">
        {state.status === 'error' ? (
          <>
            <p role="alert" className="text-caption text-error">
              Не удалось проверить сессию.
            </p>
            <Button variant="secondary" onClick={() => void refresh()}>
              Повторить
            </Button>
          </>
        ) : (
          <>
            <div className="min-w-0">
              <p className="truncate font-semibold">{state.user.displayName}</p>
              <p className="break-all text-caption text-text-secondary">{state.user.email}</p>
            </div>

            <Link
              to={profilePath}
              className="inline-flex min-h-10 items-center justify-center rounded-control border border-border bg-control px-3 text-sm font-semibold text-text-primary hover:border-text-secondary hover:bg-control-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
            >
              Личный профиль
            </Link>

            <Button variant="secondary" disabled={isLoggingOut} onClick={handleLogout}>
              {isLoggingOut ? 'Выходим…' : 'Выйти'}
            </Button>

            {logoutError && (
              <p role="alert" className="text-caption text-error">
                {logoutError}
              </p>
            )}
          </>
        )}
      </div>
    </Popover>
  );
}
