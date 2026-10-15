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
import { ErrorState, SocialNotFoundState, SocialPageSkeleton, YaneMark } from '@/shared';
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
  const watermarks = [
    '-left-10 top-20 size-48 rotate-[18deg] opacity-[0.22]',
    'left-[36%] -top-10 size-56 -rotate-[18deg] opacity-[0.2]',
    'left-[18%] top-[15rem] size-24 rotate-[142deg] opacity-[0.16]',
    'left-[72%] top-[19rem] size-36 -rotate-[24deg] opacity-[0.18]',
    '-right-12 top-[26rem] size-56 rotate-[22deg] opacity-[0.24]',
    'left-[43%] top-[34rem] size-28 rotate-[34deg] opacity-[0.16]',
    'left-[12%] top-[48rem] size-40 rotate-[138deg] opacity-[0.2]',
    'left-[82%] top-[52rem] size-32 -rotate-[32deg] opacity-[0.17]',
    'left-[62%] top-[62rem] size-48 -rotate-[24deg] opacity-[0.22]',
    'left-[29%] top-[74rem] size-36 rotate-[16deg] opacity-[0.17]',
    '-right-8 top-[88rem] size-44 -rotate-[138deg] opacity-[0.2]',
  ];

  return (
    <section className="relative isolate mx-auto max-w-[1600px] overflow-hidden rounded-card border border-context-border bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3">
      <title>{`${profile.displayName} (@${profile.handle}) — yaneMedia`}</title>
      <meta name="description" content={description} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {watermarks.map((className) => (
          <YaneMark key={className} className={`absolute ${className} text-watermark`} />
        ))}
        <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-watermark/8" />
      </div>
      <div className="relative z-10 space-y-3">
        <PublicProfileHeader profile={profile} isOwner={isOwner} />
        <PublicProfileActivity
          profile={profile}
          viewer={viewer}
          viewerReady={state.status !== 'loading'}
          ownerAccountKey={isOwner ? accountKey : undefined}
        />
      </div>
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
