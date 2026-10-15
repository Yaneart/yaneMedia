import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { readSocialIntentState, type SocialActionIntent } from './socialAccess';

export function useRestoreSocialAction(
  intent: SocialActionIntent,
  restore: () => void,
  enabled = true,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    if (!enabled || readSocialIntentState(location.state) !== intent) return;

    const frame = requestAnimationFrame(() => {
      restoreRef.current();
      void navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { replace: true, state: null, preventScrollReset: true },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [
    enabled,
    intent,
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);
}
