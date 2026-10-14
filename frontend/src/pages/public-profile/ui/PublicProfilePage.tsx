import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';

import { publicProfileQueryOptions } from '@/features/social-data';
import { ErrorState, SocialNotFoundState, SocialPageSkeleton } from '@/shared';
import { ApiClientError } from '@/shared/api';

export function PublicProfilePage() {
  const handle = useParams().handle ?? '';
  const query = useQuery({ ...publicProfileQueryOptions(handle), enabled: handle.length > 0 });

  if (!handle) return <SocialNotFoundState kind="profile" />;
  if (query.isPending) return <SocialPageSkeleton variant="public-profile" />;
  if (query.error instanceof ApiClientError && query.error.status === 404) {
    return <SocialNotFoundState kind="profile" />;
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        variant="page"
        title="Не удалось загрузить публичный профиль"
        onRetry={() => void query.refetch({ cancelRefetch: false })}
      />
    );
  }

  const profile = query.data;
  return (
    <section className="mx-auto max-w-5xl py-8">
      <p className="text-caption font-semibold tracking-wider text-accent-text uppercase">
        Публичный профиль
      </p>
      <h1 data-page-heading tabIndex={-1} className="mt-2 text-3xl font-semibold text-text-primary">
        {profile.displayName}
      </h1>
      <p className="mt-2 text-body text-text-secondary">@{profile.handle}</p>
      {profile.bio && <p className="mt-6 max-w-2xl text-body text-text-secondary">{profile.bio}</p>}
    </section>
  );
}
