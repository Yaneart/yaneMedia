import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ComponentType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { createPublicProfilePath, routePaths } from '@/app/router/routes';
import { loadPublicProfilePage } from '@/app/router/socialRouteLoaders';
import { useAuth } from '@/entities/auth';
import type { PrivateProfile } from '@/entities/profile';
import { privateProfileQueryOptions, profileSettingsQueryOptions } from '@/features/social-data';
import {
  ArrowRightIcon,
  CommentIcon,
  createReturnToSearch,
  ErrorState,
  FavoriteIcon,
  HistoryIcon,
  MailIcon,
  ProfileIcon,
  ShieldIcon,
  SocialPageSkeleton,
  StarIcon,
  type IconProps,
} from '@/shared';
import {
  getProfileCountHint,
  getProfileInitial,
  isGeneratedProfileHandle,
} from '../model/profilePresentation';
import { ProfileEditForm } from './ProfileEditForm';

type ProfileLink = {
  title: string;
  description: string;
  to: string;
  icon: ComponentType<IconProps>;
  preload?: () => void;
};

const linkClassName = [
  'group flex min-h-24 items-center gap-4 rounded-control border border-border bg-surface-elevated p-4',
  'transition-[background-color,border-color,box-shadow] hover:border-context-border hover:bg-interactive-hover',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20',
  'motion-reduce:transition-none',
].join(' ');

function ProfileAvatar({ profile }: { profile: PrivateProfile }) {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => setHasImageError(false), [profile.avatarUrl]);

  if (profile.avatarUrl && !hasImageError) {
    return (
      <img
        src={profile.avatarUrl}
        alt={`Аватар ${profile.displayName}`}
        className="size-24 shrink-0 rounded-full bg-control object-cover sm:size-32"
        onError={() => setHasImageError(true)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`Аватар ${profile.displayName}`}
      className="grid size-24 shrink-0 place-items-center rounded-full border border-context-border bg-watermark/10 text-3xl font-semibold text-accent-text sm:size-32 sm:text-4xl"
    >
      {getProfileInitial(profile.displayName, profile.handle)}
    </div>
  );
}

function CountCard({
  count,
  label,
  icon: Icon,
}: {
  count: number;
  label: string;
  icon: ComponentType<IconProps>;
}) {
  return (
    <div className="rounded-control border border-border bg-surface-elevated p-4">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-caption text-text-secondary">{label}</dt>
        <Icon aria-hidden="true" className="size-5 text-accent-text" />
      </div>
      <dd className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-text-primary">{count}</span>
        <span className="text-caption text-text-secondary">{getProfileCountHint(count)}</span>
      </dd>
    </div>
  );
}

function ProfileNavigation({ profile }: { profile: PrivateProfile }) {
  const links: ProfileLink[] = [
    {
      title: 'Публичный профиль',
      description: 'Посмотреть страницу так, как её видят другие',
      to: createPublicProfilePath(profile.handle),
      icon: ProfileIcon,
      preload: loadPublicProfilePage,
    },
    {
      title: 'Избранное',
      description: `${profile.counts.favorites} сохранено в вашей медиатеке`,
      to: routePaths.favorites,
      icon: FavoriteIcon,
    },
    {
      title: 'История',
      description: 'Вернуться к недавно открытым произведениям',
      to: routePaths.history,
      icon: HistoryIcon,
    },
    {
      title: 'Безопасность',
      description: 'Сменить пароль через подтверждение по email',
      to: routePaths.forgotPassword,
      icon: ShieldIcon,
    },
  ];

  return (
    <nav aria-label="Разделы аккаунта" className="mt-8 grid gap-3 sm:grid-cols-2">
      {links.map(({ title, description, to, icon: Icon, preload }) => (
        <Link
          key={title}
          to={to}
          className={linkClassName}
          onFocus={preload}
          onPointerEnter={preload}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') preload?.();
          }}
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-watermark/10 text-accent-text">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-text-primary">{title}</span>
            <span className="mt-1 block text-caption text-text-secondary">{description}</span>
          </span>
          <ArrowRightIcon
            aria-hidden="true"
            className="size-5 shrink-0 text-text-secondary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      ))}
    </nav>
  );
}

function PrivateProfileView({
  accountKey,
  profile,
  settings,
}: {
  accountKey: string;
  profile: PrivateProfile;
  settings: import('@/entities/profile').ProfileSettings;
}) {
  const hasGeneratedHandle = isGeneratedProfileHandle(profile.handle);

  return (
    <section className="mx-auto max-w-5xl py-8">
      <div className="rounded-card border border-border bg-surface p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <ProfileAvatar profile={profile} />
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold tracking-wider text-accent-text uppercase">
              Личный профиль
            </p>
            <h1
              data-page-heading
              tabIndex={-1}
              className="mt-2 break-words text-3xl font-semibold text-text-primary"
            >
              {profile.displayName}
            </h1>
            {hasGeneratedHandle ? (
              <div className="mt-3 w-fit max-w-full rounded-control border border-context-border bg-watermark/10 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-text-primary">Адрес профиля</span>
                  <span className="rounded-pill bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary">
                    назначен автоматически
                  </span>
                </div>
                <p className="mt-1 break-all text-caption text-text-secondary">@{profile.handle}</p>
              </div>
            ) : (
              <p className="mt-1 break-all text-body text-text-secondary">@{profile.handle}</p>
            )}
            {profile.bio && (
              <p className="mt-4 max-w-2xl whitespace-pre-line text-body text-text-secondary">
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        <ProfileEditForm
          key={accountKey}
          accountKey={accountKey}
          profile={profile}
          settings={settings}
        />

        <div className="mt-6 flex flex-col gap-3 rounded-control border border-border bg-surface-elevated p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <MailIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-secondary" />
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold text-text-primary">{profile.email}</p>
              <p className="mt-1 text-caption text-text-secondary">Email виден только вам</p>
            </div>
          </div>
          <span
            className={[
              'w-fit shrink-0 rounded-pill px-3 py-1.5 text-caption font-semibold',
              profile.emailVerified ? 'bg-success/10 text-success' : 'bg-error/10 text-error',
            ].join(' ')}
          >
            {profile.emailVerified ? 'Email подтверждён' : 'Email не подтверждён'}
          </span>
        </div>

        <section aria-labelledby="profile-activity-heading" className="mt-8">
          <h2 id="profile-activity-heading" className="text-heading text-text-primary">
            Ваша активность
          </h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <CountCard count={profile.counts.ratings} label="Оценки" icon={StarIcon} />
            <CountCard count={profile.counts.reviews} label="Рецензии" icon={ProfileIcon} />
            <CountCard count={profile.counts.comments} label="Комментарии" icon={CommentIcon} />
          </dl>
        </section>

        <ProfileNavigation profile={profile} />
      </div>
    </section>
  );
}

export function ProfilePage() {
  const { state, refresh } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const accountKey = state.status === 'authenticated' ? state.user.email : '';
  const query = useQuery({
    ...privateProfileQueryOptions(accountKey),
    enabled: state.status === 'authenticated',
  });
  const settingsQuery = useQuery({
    ...profileSettingsQueryOptions(accountKey),
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
        onRetry={() => void navigate(`${routePaths.login}${createReturnToSearch(returnTo)}`)}
        retryLabel="Войти"
      />
    );
  }

  if (query.isPending || settingsQuery.isPending) {
    return <SocialPageSkeleton variant="private-profile" />;
  }
  if (query.isError || !query.data || settingsQuery.isError || !settingsQuery.data) {
    return (
      <ErrorState
        variant="page"
        title="Не удалось загрузить профиль"
        description="Данные аккаунта не были заменены локальной копией. Проверьте соединение и повторите запрос."
        onRetry={() => {
          void query.refetch({ cancelRefetch: false });
          void settingsQuery.refetch({ cancelRefetch: false });
        }}
      />
    );
  }

  return (
    <PrivateProfileView
      accountKey={accountKey}
      profile={query.data}
      settings={settingsQuery.data}
    />
  );
}
