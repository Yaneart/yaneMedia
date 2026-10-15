import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router';

import { routePaths } from '@/app/router/routes';
import type { PublicProfile } from '@/entities/profile';
import { CommentIcon, FavoriteIcon, ProfileIcon, StarIcon, type IconProps } from '@/shared';
import { getProfileInitial } from '@/pages/profile/model/profilePresentation';
import { formatProfileJoinedAt } from '../model/publicProfilePresentation';

type PublicProfileHeaderProps = {
  profile: PublicProfile;
  isOwner: boolean;
};

function Count({
  count,
  label,
  icon: Icon,
}: {
  count: number;
  label: string;
  icon: ComponentType<IconProps>;
}) {
  return (
    <div className="relative min-w-0 rounded-control border border-context-border bg-surface-elevated/65 p-2.5">
      <dt className="truncate pr-5 text-caption text-text-secondary">{label}</dt>
      <Icon aria-hidden="true" className="absolute top-2.5 right-2.5 size-4 text-accent-text" />
      <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{count}</dd>
    </div>
  );
}

export function PublicProfileHeader({ profile, isOwner }: PublicProfileHeaderProps) {
  const [hasAvatarError, setHasAvatarError] = useState(false);

  useEffect(() => setHasAvatarError(false), [profile.avatarUrl]);

  const counts = [
    { count: profile.counts.reviews, label: 'Рецензии', icon: ProfileIcon },
    { count: profile.counts.comments, label: 'Комментарии', icon: CommentIcon },
    ...(!profile.visibility.ratings || profile.counts.ratings === null
      ? []
      : [{ count: profile.counts.ratings, label: 'Оценки', icon: StarIcon }]),
    ...(!profile.visibility.favorites || profile.counts.favorites === null
      ? []
      : [{ count: profile.counts.favorites, label: 'Избранное', icon: FavoriteIcon }]),
  ];

  return (
    <header className="rounded-card border border-context-border/80 bg-surface/35 p-3 sm:p-4">
      <div className="grid items-center gap-4 sm:grid-cols-[112px_minmax(0,1fr)] lg:grid-cols-[128px_minmax(0,1fr)_auto]">
        {profile.avatarUrl && !hasAvatarError ? (
          <img
            src={profile.avatarUrl}
            alt={`Аватар ${profile.displayName}`}
            className="mx-auto size-24 shrink-0 rounded-full border border-context-border bg-control object-cover sm:size-28 lg:size-32"
            onError={() => setHasAvatarError(true)}
          />
        ) : (
          <div
            role="img"
            aria-label={`Аватар ${profile.displayName}`}
            className="mx-auto grid size-24 shrink-0 place-items-center rounded-full border border-context-border bg-watermark/10 text-3xl font-semibold text-accent-text sm:size-28 sm:text-4xl lg:size-32"
          >
            {getProfileInitial(profile.displayName, profile.handle)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="inline-flex rounded-pill border border-context-border bg-watermark/10 px-3 py-1 text-caption font-semibold tracking-wide text-accent-text uppercase">
                Публичный профиль
              </p>
              <h1
                data-page-heading
                tabIndex={-1}
                className="mt-2 break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl xl:text-4xl"
              >
                {profile.displayName}
              </h1>
              <p className="mt-1 break-all text-body text-text-secondary">@{profile.handle}</p>
            </div>

            {isOwner && (
              <Link
                to={routePaths.profile}
                className="group inline-flex min-h-11 w-fit shrink-0 items-center gap-2 rounded-control border border-context-border bg-surface/50 px-4 text-sm font-semibold text-text-primary shadow-sm transition-colors hover:border-watermark/60 hover:bg-watermark/20 focus-visible:ring-2 focus-visible:ring-action/30 focus-visible:outline-none motion-reduce:transition-none sm:col-span-2 sm:justify-self-start lg:col-span-1 lg:justify-self-end"
              >
                <ProfileIcon aria-hidden="true" className="size-4" />
                Редактировать
              </Link>
            )}
          </div>

          {profile.bio && (
            <p className="mt-2 line-clamp-3 max-w-2xl whitespace-pre-line text-sm text-text-secondary">
              {profile.bio}
            </p>
          )}
          <p className="mt-3 text-caption text-text-secondary">
            {formatProfileJoinedAt(profile.joinedAt)}
          </p>
        </div>
      </div>

      <dl
        className={`mt-4 grid grid-cols-2 gap-2 ${counts.length > 2 ? 'lg:grid-cols-4' : 'sm:grid-cols-2'}`}
      >
        {counts.map((item) => (
          <Count key={item.label} {...item} />
        ))}
      </dl>
    </header>
  );
}
