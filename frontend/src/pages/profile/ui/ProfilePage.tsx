import { useQuery } from '@tanstack/react-query';
import { useRef, type ComponentType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { createPublicProfilePath, routePaths } from '@/app/router/routes';
import { loadPublicProfilePage } from '@/app/router/socialRouteLoaders';
import { useAuth } from '@/entities/auth';
import type { PrivateProfile } from '@/entities/profile';
import { privateProfileQueryOptions, profileSettingsQueryOptions } from '@/features/social-data';
import {
  createSocialLoginSearch,
  describeSocialAccessError,
  useRestoreSocialAction,
} from '@/features/social-access';
import {
  ArrowRightIcon,
  CommentIcon,
  ErrorState,
  FavoriteIcon,
  HistoryIcon,
  MailIcon,
  ProfileIcon,
  ShieldIcon,
  SocialPageSkeleton,
  StarIcon,
  YaneMark,
  type IconProps,
} from '@/shared';
import { getProfileCountHint, isGeneratedProfileHandle } from '../model/profilePresentation';
import { ProfileAvatarEditor } from './ProfileAvatarEditor';
import { ProfileEditForm } from './ProfileEditForm';

type ProfileLink = {
  title: string;
  to: string;
  icon: ComponentType<IconProps>;
};

const linkClassName = [
  'group flex min-h-12 items-center gap-2 rounded-control border border-border bg-surface-elevated/70 p-2',
  'transition-[background-color,border-color,box-shadow] hover:border-watermark/50 hover:bg-watermark/10',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20',
  'motion-reduce:transition-none',
].join(' ');

const profileWatermarks = [
  '-left-8 top-20 size-44 rotate-[22deg] opacity-[0.28]',
  'left-[18%] top-[13rem] size-24 -rotate-[28deg] opacity-[0.24]',
  'left-[42%] -top-10 size-56 rotate-[138deg] opacity-[0.26]',
  'left-[68%] top-28 size-32 rotate-[35deg] opacity-[0.27]',
  '-right-12 top-[18rem] size-56 -rotate-[20deg] opacity-[0.3]',
  'left-[7%] top-[36rem] size-28 rotate-[142deg] opacity-[0.22]',
  'left-[35%] top-[43rem] size-40 rotate-[28deg] opacity-[0.25]',
  'left-[59%] top-[34rem] size-24 -rotate-[18deg] opacity-[0.22]',
  'left-[84%] top-[49rem] size-40 rotate-[145deg] opacity-[0.28]',
  '-left-10 top-[60rem] size-48 -rotate-[26deg] opacity-[0.25]',
  'left-[25%] top-[70rem] size-40 rotate-[24deg] opacity-[0.28]',
  'left-[52%] top-[80rem] size-28 rotate-[138deg] opacity-[0.24]',
  'left-[73%] top-[90rem] size-52 -rotate-[24deg] opacity-[0.28]',
];

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
    <div className="relative rounded-control border border-border bg-surface-elevated/65 p-2.5">
      <dt className="truncate pr-5 text-caption text-text-secondary">{label}</dt>
      <Icon aria-hidden="true" className="absolute top-2.5 right-2.5 size-4 text-accent-text" />
      <dd className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums text-text-primary">{count}</span>
        <span className="truncate text-caption text-text-secondary">
          {getProfileCountHint(count)}
        </span>
      </dd>
    </div>
  );
}

function ProfileNavigation() {
  const links: ProfileLink[] = [
    {
      title: 'Избранное',
      to: routePaths.favorites,
      icon: FavoriteIcon,
    },
    {
      title: 'История',
      to: routePaths.history,
      icon: HistoryIcon,
    },
  ];

  return (
    <nav aria-label="Разделы аккаунта" className="grid gap-2 sm:grid-cols-2">
      {links.map(({ title, to, icon: Icon }) => (
        <Link key={title} to={to} className={linkClassName}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-watermark/10 text-accent-text transition-colors group-hover:bg-watermark/20">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-text-primary transition-colors group-hover:text-accent-text">
              {title}
            </span>
          </span>
          <ArrowRightIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-text-secondary transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-accent-text motion-reduce:transition-none"
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  useRestoreSocialAction('profile', () => headingRef.current?.focus());

  return (
    <section className="relative isolate mx-auto max-w-[1600px] overflow-hidden rounded-card border border-context-border bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {profileWatermarks.map((className) => (
          <YaneMark key={className} className={`absolute ${className} text-watermark`} />
        ))}
        <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-watermark/8" />
      </div>
      <div className="relative z-10 space-y-4">
        <header className="rounded-card border border-context-border/80 bg-surface/35 p-3 sm:p-4">
          <div className="grid items-center gap-4 sm:grid-cols-[160px_minmax(0,1fr)] lg:grid-cols-[160px_minmax(0,1fr)_auto]">
            <ProfileAvatarEditor accountKey={accountKey} profile={profile} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-pill border border-context-border bg-watermark/10 px-3 py-1 text-caption font-semibold tracking-wide text-accent-text uppercase">
                  yaneMedia · Личный кабинет
                </span>
                {profile.emailVerified && (
                  <span className="rounded-pill bg-success/10 px-3 py-1 text-caption font-semibold text-success">
                    Email подтверждён
                  </span>
                )}
              </div>
              <h1
                ref={headingRef}
                data-page-heading
                tabIndex={-1}
                className="mt-2 break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl xl:text-4xl"
              >
                {profile.displayName}
              </h1>
              {hasGeneratedHandle ? (
                <div className="mt-3 w-fit max-w-full rounded-control border border-context-border bg-surface/50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-text-primary">Адрес профиля</span>
                    <span className="rounded-pill bg-surface-elevated px-2 py-0.5 text-xs text-text-secondary">
                      назначен автоматически
                    </span>
                  </div>
                  <p className="mt-1 break-all text-caption text-text-secondary">
                    @{profile.handle}
                  </p>
                </div>
              ) : (
                <p className="mt-1 break-all text-base text-text-secondary">@{profile.handle}</p>
              )}
              {profile.bio && (
                <p className="mt-2 line-clamp-2 max-w-2xl whitespace-pre-line text-sm text-text-secondary">
                  {profile.bio}
                </p>
              )}
            </div>
            <Link
              to={createPublicProfilePath(profile.handle)}
              className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-context-border bg-surface/50 px-4 text-sm font-semibold text-text-primary shadow-sm transition-colors hover:border-watermark/60 hover:bg-watermark/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30 sm:col-span-2 sm:justify-self-start lg:col-span-1 lg:justify-self-end"
              onFocus={loadPublicProfilePage}
              onPointerEnter={loadPublicProfilePage}
              onPointerDown={(event) => {
                if (event.pointerType === 'touch') void loadPublicProfilePage();
              }}
            >
              <ProfileIcon aria-hidden="true" className="size-5 text-accent-text" />
              Публичная страница
              <ArrowRightIcon
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </header>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
          <ProfileEditForm
            key={accountKey}
            accountKey={accountKey}
            profile={profile}
            settings={settings}
          />

          <aside className="flex flex-col gap-3">
            <section
              aria-labelledby="profile-account-heading"
              className="rounded-card border border-border bg-surface/40 p-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-caption font-semibold tracking-wider text-accent-text uppercase">
                    Безопасность
                  </p>
                  <h2 id="profile-account-heading" className="mt-1 text-heading text-text-primary">
                    Ваш аккаунт
                  </h2>
                </div>
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-watermark/10 text-accent-text">
                  <ShieldIcon aria-hidden="true" className="size-5" />
                </span>
              </div>
              <div className="mt-3 rounded-control border border-border bg-surface-elevated/55 p-2.5">
                <div className="flex min-w-0 items-start gap-3">
                  <MailIcon
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-text-secondary"
                  />
                  <div className="min-w-0">
                    <p className="break-all text-sm font-semibold text-text-primary">
                      {profile.email}
                    </p>
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-2 text-caption text-text-secondary">
                  <span
                    className={`size-2 rounded-full ${profile.emailVerified ? 'bg-success' : 'bg-error'}`}
                  />
                  {profile.emailVerified ? 'Email подтверждён' : 'Email не подтверждён'}
                </p>
              </div>
              <Link
                to={routePaths.forgotPassword}
                className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-accent-text hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
              >
                <ShieldIcon aria-hidden="true" className="size-4" />
                Сменить пароль
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            </section>

            <section
              aria-labelledby="profile-activity-heading"
              className="rounded-card border border-border bg-surface/40 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id="profile-activity-heading" className="text-heading text-text-primary">
                  Ваша активность
                </h2>
                <span className="text-caption text-text-secondary">yaneMedia</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <CountCard count={profile.counts.ratings} label="Оценки" icon={StarIcon} />
                <CountCard count={profile.counts.reviews} label="Рецензии" icon={ProfileIcon} />
                <CountCard count={profile.counts.comments} label="Комментарии" icon={CommentIcon} />
              </dl>
            </section>

            <section
              aria-labelledby="profile-shortcuts-heading"
              className="flex-1 rounded-card border border-border bg-surface/40 p-3"
            >
              <h2 id="profile-shortcuts-heading" className="text-heading text-text-primary">
                Быстрые переходы
              </h2>
              <div className="mt-4">
                <ProfileNavigation />
              </div>
            </section>
          </aside>
        </div>
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
        onRetry={() =>
          void navigate(`${routePaths.login}${createSocialLoginSearch(returnTo, 'profile')}`)
        }
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
        description={
          describeSocialAccessError(
            query.error ?? settingsQuery.error,
            'Данные аккаунта не были заменены локальной копией. Проверьте соединение и повторите запрос.',
          ).message
        }
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
