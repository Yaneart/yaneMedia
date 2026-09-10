import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';

import type { RowScrollRestoration } from './scrollRestorationContext';
import {
  getMainScrollTop,
  getRowScrollLeft,
  replaceScrollEntry,
  saveMainScrollTop,
  saveRowScrollLeft,
} from './scrollPositionStore';

const RESTORE_TOLERANCE_PX = 1;

export function useAppScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const mainRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const previousLocationRef = useRef({ key: location.key, pathname: location.pathname });

  const applyPendingRestoration = useCallback(() => {
    const main = mainRef.current;
    const targetScrollTop = pendingScrollTopRef.current;

    if (!main || targetScrollTop === null) return;

    const maximumScrollTop = Math.max(0, main.scrollHeight - main.clientHeight);
    main.scrollTop = Math.min(targetScrollTop, maximumScrollTop);

    if (targetScrollTop <= maximumScrollTop + RESTORE_TOLERANCE_PX) {
      pendingScrollTopRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    const previousLocation = previousLocationRef.current;

    if (
      navigationType === 'REPLACE' &&
      previousLocation.key !== location.key &&
      previousLocation.pathname === location.pathname
    ) {
      replaceScrollEntry(previousLocation.key, location.key);
    }

    pendingScrollTopRef.current = getMainScrollTop(location.key);
    applyPendingRestoration();
    previousLocationRef.current = { key: location.key, pathname: location.pathname };
  }, [applyPendingRestoration, location.key, location.pathname, navigationType]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const content = contentRef.current;

    if (!main || !content || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(applyPendingRestoration);
    observer.observe(main);
    observer.observe(content);

    return () => observer.disconnect();
  }, [applyPendingRestoration]);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  const saveMainPosition = useCallback(() => {
    const main = mainRef.current;

    if (!main || pendingScrollTopRef.current !== null) return;

    saveMainScrollTop(location.key, main.scrollTop);
  }, [location.key]);

  const cancelPendingRestoration = useCallback(() => {
    pendingScrollTopRef.current = null;

    if (mainRef.current) {
      saveMainScrollTop(location.key, mainRef.current.scrollTop);
    }
  }, [location.key]);

  const rowScrollRestoration = useMemo<RowScrollRestoration>(
    () => ({
      getScrollLeft: (rowKey) => getRowScrollLeft(location.key, rowKey),
      saveScrollLeft: (rowKey, scrollLeft) => saveRowScrollLeft(location.key, rowKey, scrollLeft),
    }),
    [location.key],
  );

  return {
    cancelPendingRestoration,
    contentRef,
    mainRef,
    rowScrollRestoration,
    saveMainPosition,
  };
}
