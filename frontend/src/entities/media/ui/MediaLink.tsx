import type { FocusEvent, PointerEvent } from 'react';
import { Link, type LinkProps } from 'react-router';

import { useMediaDetailsPrefetch } from '../model/useMediaDetailsPrefetch';
import type { MediaRef } from '../model/media';

export type MediaLinkProps = Omit<LinkProps, 'to'> & {
  mediaRef: MediaRef;
};

export function MediaLink({
  mediaRef,
  onFocus,
  onPointerEnter,
  onPointerLeave,
  ...props
}: MediaLinkProps) {
  const { cancelScheduledPrefetch, prefetch, schedulePrefetch } = useMediaDetailsPrefetch(mediaRef);

  const handleFocus = (event: FocusEvent<HTMLAnchorElement>) => {
    onFocus?.(event);
    if (!event.defaultPrevented) prefetch();
  };

  const handlePointerEnter = (event: PointerEvent<HTMLAnchorElement>) => {
    onPointerEnter?.(event);
    if (!event.defaultPrevented) schedulePrefetch();
  };

  const handlePointerLeave = (event: PointerEvent<HTMLAnchorElement>) => {
    onPointerLeave?.(event);
    cancelScheduledPrefetch();
  };

  return (
    <Link
      {...props}
      to={`/media/${encodeURIComponent(mediaRef)}`}
      onFocus={handleFocus}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    />
  );
}
