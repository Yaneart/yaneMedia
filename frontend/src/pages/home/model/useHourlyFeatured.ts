import { useEffect, useState } from 'react';
import {
  getMillisecondsUntilNextHour,
  getUtcHourSlot,
  selectFeaturedForHour,
} from './featuredRotation';
import type { MediaSummary } from '@/entities/media';

export function useHourlyFeatured(candidates: readonly MediaSummary[]) {
  const [hourSlot, setHourSlot] = useState(getUtcHourSlot);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setHourSlot(getUtcHourSlot()),
      getMillisecondsUntilNextHour() + 100,
    );

    return () => window.clearTimeout(timeout);
  }, [hourSlot]);

  return selectFeaturedForHour(candidates, hourSlot);
}
