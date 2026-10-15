import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';

import { createPublicProfilePath } from '@/app/router/routes';
import { useAuth } from '@/entities/auth';
import type { PublicProfile } from '@/entities/profile';
import {
  privateProfileQueryOptions,
  publicProfileQueryOptions,
  type SocialViewer,
} from '@/features/social-data';
import { ErrorState, SocialNotFoundState, SocialPageSkeleton } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { getPublicProfileDescription } from '../model/publicProfilePresentation';
import { PublicProfileActivity } from './PublicProfileActivity';
import { PublicProfileHeader } from './PublicProfileHeader';

function PublicProfileView({
  profile,
  requestedHandle,
}: {
  profile: PublicProfile;
  requestedHandle: string;
}) {
  const navigate = useNavigate();
  const { state } = useAuth();
  const accountKey = state.status === 'authenticated' ? state.user.email : '';
  const ownerQuery = useQuery({
    ...privateProfileQueryOptions(accountKey),
    enabled: state.status === 'authenticated',
  });
  const viewer: SocialViewer = state.status === 'authenticated' ? { accountKey } : 'guest';

  useEffect(() => {
    if (requestedHandle !== profile.handle) {
      void navigate(createPublicProfilePath(profile.handle), { replace: true });
    }
  }, [navigate, profile.handle, requestedHandle]);

  const isOwner = ownerQuery.data?.handle === profile.handle;
  const description = getPublicProfileDescription(profile);

  return (
    <section className="mx-auto max-w-5xl py-8">
      <title>{`${profile.displayName} (@${profile.handle}) — yaneMedia`}</title>
      <meta name="description" content={description} />
      <PublicProfileHeader profile={profile} isOwner={isOwner} />
      <PublicProfileActivity
        profile={profile}
        viewer={viewer}
        viewerReady={state.status !== 'loading'}
        ownerAccountKey={isOwner ? accountKey : undefined}
      />
    </section>
  );
}

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
  return <PublicProfileView key={profile.handle} profile={profile} requestedHandle={handle} />;
}
