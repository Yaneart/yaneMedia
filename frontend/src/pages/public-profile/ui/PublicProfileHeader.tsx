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
    <div className="rounded-control border border-border bg-surface-elevated px-4 py-3">
      <dt className="flex items-center gap-2 text-caption text-text-secondary">
        <Icon aria-hidden="true" className="size-4 text-accent-text" />
        {label}
      </dt>
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
    <header className="rounded-card border border-border bg-surface p-5 sm:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {profile.avatarUrl && !hasAvatarError ? (
          <img
            src={profile.avatarUrl}
            alt={`Аватар ${profile.displayName}`}
            className="size-24 shrink-0 rounded-full bg-control object-cover sm:size-32"
            onError={() => setHasAvatarError(true)}
          />
        ) : (
          <div
            role="img"
            aria-label={`Аватар ${profile.displayName}`}
            className="grid size-24 shrink-0 place-items-center rounded-full border border-context-border bg-watermark/10 text-3xl font-semibold text-accent-text sm:size-32 sm:text-4xl"
          >
            {getProfileInitial(profile.displayName, profile.handle)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-caption font-semibold tracking-wider text-accent-text uppercase">
                Публичный профиль
              </p>
              <h1
                data-page-heading
                tabIndex={-1}
                className="mt-2 break-words text-3xl font-semibold text-text-primary sm:text-4xl"
              >
                {profile.displayName}
              </h1>
              <p className="mt-1 break-all text-body text-text-secondary">@{profile.handle}</p>
            </div>

            {isOwner && (
              <Link
                to={routePaths.profile}
                className="inline-flex min-h-9 w-fit shrink-0 items-center gap-2 rounded-control px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-interactive-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-action/20 focus-visible:outline-none motion-reduce:transition-none"
              >
                <ProfileIcon aria-hidden="true" className="size-4" />
                Редактировать
              </Link>
            )}
          </div>

          {profile.bio && (
            <p className="mt-5 max-w-2xl whitespace-pre-line text-body text-text-primary">
              {profile.bio}
            </p>
          )}
          <p className="mt-4 text-caption text-text-secondary">
            {formatProfileJoinedAt(profile.joinedAt)}
          </p>
        </div>
      </div>

      <dl
        className={`mt-6 grid gap-3 ${counts.length > 2 ? 'grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'}`}
      >
        {counts.map((item) => (
          <Count key={item.label} {...item} />
        ))}
      </dl>
    </header>
  );
}
