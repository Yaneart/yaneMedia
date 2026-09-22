import type { FocusEvent, MouseEvent, PointerEvent } from 'react';
import { Link, type LinkProps } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';

import { useMediaDetailsPrefetch } from '../model/useMediaDetailsPrefetch';
import { seedMediaSummary } from '../model/mediaSummaryCache';
import type { MediaRef, MediaSummary } from '../model/media';

export type MediaLinkProps = Omit<LinkProps, 'to'> & {
  mediaRef: MediaRef;
  summary?: MediaSummary;
};

export function MediaLink({
  mediaRef,
  summary,
  onClick,
  onFocus,
  onPointerEnter,
  onPointerLeave,
  ...props
}: MediaLinkProps) {
  const queryClient = useQueryClient();
  const { cancelScheduledPrefetch, prefetch, schedulePrefetch } = useMediaDetailsPrefetch(mediaRef);

  const seedSummary = () => {
    if (summary) seedMediaSummary(queryClient, summary);
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) seedSummary();
  };

  const handleFocus = (event: FocusEvent<HTMLAnchorElement>) => {
    onFocus?.(event);
    if (!event.defaultPrevented) {
      seedSummary();
      prefetch();
    }
  };

  const handlePointerEnter = (event: PointerEvent<HTMLAnchorElement>) => {
    onPointerEnter?.(event);
    if (!event.defaultPrevented) {
      seedSummary();
      schedulePrefetch();
    }
  };

  const handlePointerLeave = (event: PointerEvent<HTMLAnchorElement>) => {
    onPointerLeave?.(event);
    cancelScheduledPrefetch();
  };

  return (
    <Link
      {...props}
      to={`/media/${encodeURIComponent(mediaRef)}`}
      onClick={handleClick}
      onFocus={handleFocus}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    />
  );
}
