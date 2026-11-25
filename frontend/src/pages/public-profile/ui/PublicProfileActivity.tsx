import { useInfiniteQuery } from '@tanstack/react-query';
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

import { MediaCard } from '@/entities/media';
import type { PublicProfile } from '@/entities/profile';
import { useFavorites } from '@/features/favorite';
import {
  profileRatingsQueryOptions,
  profileReviewsQueryOptions,
  ownReviewsQueryOptions,
  publicFavoritesQueryOptions,
  type SocialViewer,
} from '@/features/social-data';
import {
  EmptyState,
  ErrorState,
  FavoriteIcon,
  InfiniteScroll,
  MediaGrid,
  ProfileIcon,
  Skeleton,
  StarIcon,
} from '@/shared';
import { mergeCursorPages } from '@/shared/api';
import { getPublicProfileTabs, type PublicProfileTabId } from '../model/publicProfilePresentation';
import { PublicProfileReviewCard } from './PublicProfileReviewCard';

type PublicProfileActivityProps = {
  profile: PublicProfile;
  viewer: SocialViewer;
  viewerReady: boolean;
  ownerAccountKey?: string;
};

function PanelSkeleton({ kind }: { kind: PublicProfileTabId }) {
  if (kind !== 'reviews') {
    return (
      <MediaGrid
        aria-label="Загружаем раздел профиля"
        aria-busy="true"
        className="p-4 sm:p-6 wide:p-7"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={index < 4 ? '' : 'hidden 2xl:block'}>
            <Skeleton className="aspect-2/3 rounded-card" />
            <Skeleton className="mt-2 h-5 w-4/5 rounded-control" />
            <Skeleton className="mt-2 h-4 w-2/5 rounded-control" />
          </div>
        ))}
      </MediaGrid>
    );
  }

  return (
    <div
      aria-label="Загружаем раздел профиля"
      aria-busy="true"
      className="grid gap-3 p-4 sm:p-6 wide:p-7"
    >
      <Skeleton className="h-40 rounded-control" />
      <Skeleton className="h-40 rounded-control" />
      <Skeleton className="h-40 rounded-control" />
    </div>
  );
}

function PanelContent({ children }: { children: ReactNode }) {
  return <div className="p-4 sm:p-6 wide:p-7">{children}</div>;
}

export function PublicProfileActivity({
  profile,
  viewer,
  viewerReady,
  ownerAccountKey,
}: PublicProfileActivityProps) {
  const tabs = getPublicProfileTabs(profile);
  const [activeTab, setActiveTab] = useState<PublicProfileTabId>('ratings');
  const tabIdPrefix = useId();
  const activeTabData = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]!;
  const { isFavorite, isFavoriteUpdating, toggleFavorite, canUpdateFavorites } = useFavorites();

  const publicReviewsQuery = useInfiniteQuery({
    ...profileReviewsQueryOptions(profile.handle, viewer),
    enabled: viewerReady && activeTab === 'reviews' && !ownerAccountKey,
  });
  const ownReviewsQuery = useInfiniteQuery({
    ...ownReviewsQueryOptions(ownerAccountKey ?? 'inactive'),
    enabled: viewerReady && activeTab === 'reviews' && Boolean(ownerAccountKey),
  });
  const reviewsQuery = ownerAccountKey ? ownReviewsQuery : publicReviewsQuery;
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

  let panel: ReactNode;
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
    const items = mergeCursorPages(reviewsQuery.data?.pages ?? [], (review) => review.reviewId);
    panel = reviewsQuery.isPending ? (
      <PanelSkeleton kind="reviews" />
    ) : reviewsQuery.isError && items.length === 0 ? (
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
      <>
        <PanelContent>
          <div className="grid gap-3">
            {items.map((review) => (
              <PublicProfileReviewCard key={review.reviewId} review={review} />
            ))}
          </div>
        </PanelContent>
        <InfiniteScroll
          key={`${profile.handle}:reviews:${ownerAccountKey ?? ''}`}
          query={reviewsQuery}
          className="px-4 pb-4"
        />
      </>
    );
  } else if (activeTab === 'ratings') {
    const items = mergeCursorPages(
      ratingsQuery.data?.pages ?? [],
      (rating) => rating.media.mediaRef,
    );
    panel = ratingsQuery.isPending ? (
      <PanelSkeleton kind="ratings" />
    ) : ratingsQuery.isError && items.length === 0 ? (
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
      <>
        <PanelContent>
          <MediaGrid virtualized>
            {items.map((rating) => (
              <div key={rating.media.mediaRef} className="relative min-w-0">
                <MediaCard
                  media={rating.media}
                  isFavorite={isFavorite(rating.media.mediaRef)}
                  favoriteDisabled={
                    !canUpdateFavorites || isFavoriteUpdating(rating.media.mediaRef)
                  }
                  onFavoriteChange={() => toggleFavorite(rating.media.mediaRef)}
                />
                <span className="pointer-events-none absolute left-2 top-2 rounded-pill bg-black/70 px-2.5 py-1 text-sm font-semibold text-white shadow-sm backdrop-blur-sm">
                  {rating.value}/10
                </span>
              </div>
            ))}
          </MediaGrid>
        </PanelContent>
        <InfiniteScroll
          key={`${profile.handle}:ratings`}
          query={ratingsQuery}
          className="px-4 pb-4"
        />
      </>
    );
  } else {
    const items = mergeCursorPages(favoritesQuery.data?.pages ?? [], (media) => media.mediaRef);
    panel = favoritesQuery.isPending ? (
      <PanelSkeleton kind="favorites" />
    ) : favoritesQuery.isError && items.length === 0 ? (
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
      <>
        <PanelContent>
          <MediaGrid virtualized>
            {items.map((media) => (
              <MediaCard
                key={media.mediaRef}
                media={media}
                isFavorite={isFavorite(media.mediaRef)}
                favoriteDisabled={!canUpdateFavorites || isFavoriteUpdating(media.mediaRef)}
                onFavoriteChange={() => toggleFavorite(media.mediaRef)}
              />
            ))}
          </MediaGrid>
        </PanelContent>
        <InfiniteScroll
          key={`${profile.handle}:favorites`}
          query={favoritesQuery}
          className="px-4 pb-4"
        />
      </>
    );
  }

  return (
    <section
      aria-labelledby="profile-activity-heading"
      className="overflow-hidden rounded-card border border-border bg-surface/40"
    >
      <h2 id="profile-activity-heading" className="sr-only">
        Публичная активность
      </h2>
      <div
        role="tablist"
        aria-label="Разделы профиля"
        className="flex flex-wrap gap-1 border-b border-border/80 p-1.5 sm:gap-2 sm:p-2"
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
              'min-h-10 shrink-0 rounded-control px-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20 motion-reduce:transition-none sm:px-3 wide:min-h-12 wide:px-4',
              activeTab === tab.id
                ? 'bg-watermark/15 text-accent-text shadow-sm'
                : 'text-text-secondary hover:bg-watermark/10 hover:text-accent-text',
            ].join(' ')}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => selectAdjacentTab(event, index)}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="ml-1 tabular-nums opacity-70 sm:ml-2">{tab.count}</span>
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
