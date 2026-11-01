import { useMemo, useRef } from 'react';
import { useAuth } from '@/entities/auth';
import { createPlayerPreferences } from '@/entities/playback';

export function usePlayerPreferences() {
  const { state } = useAuth();
  const owner =
    state.status === 'authenticated'
      ? state.user.email
      : state.status === 'guest'
        ? null
        : undefined;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  return useMemo(
    () =>
      owner === undefined
        ? undefined
        : createPlayerPreferences(owner, () => currentOwner.current === owner),
    [owner],
  );
}
