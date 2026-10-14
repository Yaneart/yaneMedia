import { useInfiniteQuery } from '@tanstack/react-query';
import { useId, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';

import { createReviewPath } from '@/app/router/routes';
import { MediaLink } from '@/entities/media';
import type { PublicProfile } from '@/entities/profile';
import {
  profileRatingsQueryOptions,
  profileReviewsQueryOptions,
  publicFavoritesQueryOptions,
  type SocialViewer,
} from '@/features/social-data';
import { EmptyState, ErrorState, FavoriteIcon, ProfileIcon, Skeleton, StarIcon } from '@/shared';
import { getPublicProfileTabs, type PublicProfileTabId } from '../model/publicProfilePresentation';

type PublicProfileActivityProps = {
  profile: PublicProfile;
  viewer: SocialViewer;
  viewerReady: boolean;
};

const previewClassName =
  'block rounded-control border border-border bg-surface-elevated p-4 transition-colors hover:border-context-border hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20 motion-reduce:transition-none';

function PanelSkeleton() {
  return (
    <div aria-label="Загружаем раздел профиля" aria-busy="true" className="grid gap-3 p-4 sm:p-6">
      <Skeleton className="h-20 rounded-control" />
      <Skeleton className="h-20 rounded-control" />
      <Skeleton className="h-20 rounded-control" />
    </div>
  );
}

export function PublicProfileActivity({
  profile,
  viewer,
  viewerReady,
}: PublicProfileActivityProps) {
  const tabs = getPublicProfileTabs(profile);
  const [activeTab, setActiveTab] = useState<PublicProfileTabId>('reviews');
  const tabIdPrefix = useId();
  const activeTabData = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]!;

  const reviewsQuery = useInfiniteQuery({
    ...profileReviewsQueryOptions(profile.handle, viewer),
    enabled: viewerReady && activeTab === 'reviews',
  });
  const ratingsQuery = useInfiniteQuery({
    ...profileRatingsQueryOptions({ kind: 'public', handle: profile.handle }),
    enabled: activeTab === 'ratings' && profile.visibility.ratings,
  });
  const favoritesQuery = useInfiniteQuery({
    ...publicFavoritesQueryOptions(profile.handle),
    enabled: activeTab === 'favorites' && profile.visibility.favorites,
  });

  const selectAdjacentTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex]!;
    setActiveTab(nextTab.id);
    document.getElementById(`${tabIdPrefix}-${nextTab.id}-tab`)?.focus();
  };

  let panel;
  if (activeTabData.isPrivate) {
    panel = (
      <EmptyState
        title={`${activeTabData.label} скрыты`}
        description="Пользователь решил не показывать этот раздел публично. Количество материалов остаётся приватным."
        icon={
          activeTab === 'ratings' ? (
            <StarIcon className="size-5" />
          ) : (
            <FavoriteIcon className="size-5" />
          )
        }
      />
    );
  } else if (activeTab === 'reviews') {
    const items = reviewsQuery.data?.pages.flatMap((page) => page.items) ?? [];
    panel = reviewsQuery.isPending ? (
      <PanelSkeleton />
    ) : reviewsQuery.isError ? (
      <ErrorState
        title="Не удалось загрузить рецензии"
        description="Профиль доступен, но этот раздел временно не загрузился."
        onRetry={() => void reviewsQuery.refetch()}
      />
    ) : items.length === 0 ? (
      <EmptyState
        title="Рецензий пока нет"
        description="Опубликованные рецензии появятся здесь."
        icon={<ProfileIcon className="size-5" />}
      />
    ) : (
      <div className="grid gap-3 p-4 sm:p-6">
        {items.map((review) => (
          <Link
            key={review.reviewId}
            to={createReviewPath(review.reviewId)}
            className={previewClassName}
          >
            <p className="font-semibold text-text-primary">{review.title}</p>
            <p className="mt-1 text-caption text-text-secondary">
              {review.media.title}
              {review.rating === null ? '' : ` · ${review.rating}/10`}
            </p>
          </Link>
        ))}
      </div>
    );
  } else if (activeTab === 'ratings') {
    const items = ratingsQuery.data?.pages.flatMap((page) => page.items) ?? [];
    panel = ratingsQuery.isPending ? (
      <PanelSkeleton />
    ) : ratingsQuery.isError ? (
      <ErrorState
        title="Не удалось загрузить оценки"
        description="Профиль доступен, но этот раздел временно не загрузился."
        onRetry={() => void ratingsQuery.refetch()}
      />
    ) : items.length === 0 ? (
      <EmptyState
        title="Оценок пока нет"
        description="Публичные оценки появятся здесь."
        icon={<StarIcon className="size-5" />}
      />
    ) : (
      <div className="grid gap-3 p-4 sm:p-6">
        {items.map((rating) => (
          <MediaLink
            key={rating.media.mediaRef}
            mediaRef={rating.media.mediaRef}
            summary={rating.media}
            className={previewClassName}
          >
            <span className="flex items-center justify-between gap-4">
              <span className="min-w-0 truncate font-semibold text-text-primary">
                {rating.media.title}
              </span>
              <span className="shrink-0 rounded-pill bg-watermark/10 px-2.5 py-1 text-sm font-semibold text-accent-text">
                {rating.value}/10
              </span>
            </span>
          </MediaLink>
        ))}
      </div>
    );
  } else {
    const items = favoritesQuery.data?.pages.flatMap((page) => page.items) ?? [];
    panel = favoritesQuery.isPending ? (
      <PanelSkeleton />
    ) : favoritesQuery.isError ? (
      <ErrorState
        title="Не удалось загрузить избранное"
        description="Профиль доступен, но этот раздел временно не загрузился."
        onRetry={() => void favoritesQuery.refetch()}
      />
    ) : items.length === 0 ? (
      <EmptyState
        title="В избранном пока пусто"
        description="Публично сохранённые произведения появятся здесь."
        icon={<FavoriteIcon className="size-5" />}
      />
    ) : (
      <div className="grid gap-3 p-4 sm:p-6">
        {items.map((media) => (
          <MediaLink
            key={media.mediaRef}
            mediaRef={media.mediaRef}
            summary={media}
            className={previewClassName}
          >
            <p className="truncate font-semibold text-text-primary">{media.title}</p>
            <p className="mt-1 text-caption text-text-secondary">
              {[media.year, media.type].filter(Boolean).join(' · ')}
            </p>
          </MediaLink>
        ))}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="profile-activity-heading"
      className="mt-6 overflow-hidden rounded-card border border-border bg-surface"
    >
      <h2 id="profile-activity-heading" className="sr-only">
        Публичная активность
      </h2>
      <div
        role="tablist"
        aria-label="Разделы профиля"
        className="flex overflow-x-auto border-b border-border p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`${tabIdPrefix}-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tabIdPrefix}-${tab.id}-panel`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={[
              'min-h-10 shrink-0 rounded-control px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20 motion-reduce:transition-none',
              activeTab === tab.id
                ? 'bg-navigation-active text-navigation-active-text'
                : 'text-text-secondary hover:bg-interactive-hover hover:text-text-primary',
            ].join(' ')}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => selectAdjacentTab(event, index)}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="ml-2 tabular-nums opacity-70">{tab.count}</span>
            )}
          </button>
        ))}
      </div>
      <div
        id={`${tabIdPrefix}-${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabIdPrefix}-${activeTab}-tab`}
      >
        {panel}
      </div>
    </section>
  );
}
