import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router';

import { createPublicProfilePath, routePaths } from '@/app/router/routes';
import { loadPublicProfilePage } from '@/app/router/socialRouteLoaders';
import { useAuth } from '@/entities/auth';
import { privateProfileQueryOptions } from '@/features/social-data';
import { createReturnToSearch, ErrorState, SocialPageSkeleton } from '@/shared';

export function ProfilePage() {
  const { state, refresh } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const accountKey = state.status === 'authenticated' ? state.user.email : '';
  const query = useQuery({
    ...privateProfileQueryOptions(accountKey),
    enabled: state.status === 'authenticated',
  });

  if (state.status === 'loading') return <SocialPageSkeleton variant="private-profile" />;

  if (state.status === 'error') {
    return (
      <ErrorState
        variant="page"
        title="Не удалось проверить сессию"
        onRetry={() => void refresh()}
      />
    );
  }

  if (state.status === 'guest') {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return (
      <ErrorState
        variant="page"
        tone="accent"
        eyebrow="Личная страница"
        visualCode="@"
        visualLabel="Нужен вход"
        title="Войдите, чтобы открыть профиль"
        description="Настройки профиля и приватные данные доступны только владельцу аккаунта."
        onRetry={() => {
          void navigate(`${routePaths.login}${createReturnToSearch(returnTo)}`);
        }}
        retryLabel="Войти"
      />
    );
  }

  if (query.isPending) return <SocialPageSkeleton variant="private-profile" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        variant="page"
        title="Не удалось загрузить профиль"
        onRetry={() => void query.refetch({ cancelRefetch: false })}
      />
    );
  }

  const profile = query.data;
  return (
    <section className="mx-auto max-w-5xl py-8">
      <p className="text-caption font-semibold tracking-wider text-accent-text uppercase">
        Личный профиль
      </p>
      <h1 data-page-heading tabIndex={-1} className="mt-2 text-3xl font-semibold text-text-primary">
        {profile.displayName}
      </h1>
      <p className="mt-2 text-body text-text-secondary">@{profile.handle}</p>
      <Link
        className="mt-6 inline-block text-sm font-semibold text-action"
        to={createPublicProfilePath(profile.handle)}
        onFocus={() => void loadPublicProfilePage()}
        onPointerEnter={() => void loadPublicProfilePage()}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch') void loadPublicProfilePage();
        }}
      >
        Открыть публичный профиль
      </Link>
    </section>
  );
}
