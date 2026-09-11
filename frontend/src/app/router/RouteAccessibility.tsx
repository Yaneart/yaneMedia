import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router';

import { getDocumentTitle } from './routeTitles';
import { mainContentId } from '@/shared';

export function RouteAccessibility() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previousPathnameRef = useRef(pathname);
  const keyboardNavigationRef = useRef(false);
  const skipLinkRef = useRef<HTMLAnchorElement>(null);
  const [mediaTitle, setMediaTitle] = useState<{ pathname: string; value: string } | null>(null);

  useEffect(() => {
    const markKeyboardNavigation = (event: KeyboardEvent) => {
      const isDocumentUnfocused =
        document.activeElement === document.body ||
        document.activeElement === document.documentElement;

      if (
        event.key === 'Tab' &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        isDocumentUnfocused &&
        skipLinkRef.current
      ) {
        event.preventDefault();
        skipLinkRef.current.focus();
      }

      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Tab') {
        keyboardNavigationRef.current = true;
      }
    };
    const markPointerNavigation = () => {
      keyboardNavigationRef.current = false;
    };

    document.addEventListener('keydown', markKeyboardNavigation, true);
    document.addEventListener('pointerdown', markPointerNavigation, true);

    return () => {
      document.removeEventListener('keydown', markKeyboardNavigation, true);
      document.removeEventListener('pointerdown', markPointerNavigation, true);
    };
  }, []);

  useEffect(() => {
    if (!pathname.startsWith('/media/')) return;

    const readMediaTitle = () => {
      const heading = document.querySelector<HTMLElement>(`#${mainContentId} [data-page-heading]`);
      const value = heading?.textContent?.trim();

      if (!value) return false;

      setMediaTitle({ pathname, value });
      return true;
    };

    if (readMediaTitle()) return;

    const observer = new MutationObserver(() => {
      if (readMediaTitle()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    const timeoutId = window.setTimeout(() => observer.disconnect(), 10_000);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [pathname]);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;

    if (
      previousPathname === pathname ||
      navigationType === 'POP' ||
      !keyboardNavigationRef.current
    ) {
      return;
    }

    keyboardNavigationRef.current = false;

    const initialActiveElement = document.activeElement;
    const focusPage = () => {
      const main = document.getElementById(mainContentId);
      const activeElement = document.activeElement;
      const userMovedFocus =
        activeElement !== initialActiveElement &&
        activeElement !== document.body &&
        activeElement !== main;

      if (userMovedFocus) return 'cancelled';

      const heading = main?.querySelector<HTMLElement>('[data-page-heading]');

      if (heading) {
        heading.focus({ preventScroll: true });
        return 'complete';
      }

      main?.focus({ preventScroll: true });
      return 'waiting';
    };

    if (focusPage() === 'complete') return;

    let timeoutId: number | undefined;
    const observer = new MutationObserver(() => {
      if (focusPage() !== 'waiting') stopWaiting();
    });
    const stopWaiting = () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', stopWaiting, true);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };

    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', stopWaiting, { capture: true, once: true });

    timeoutId = window.setTimeout(stopWaiting, 10_000);

    return stopWaiting;
  }, [navigationType, pathname]);

  const documentTitle =
    mediaTitle?.pathname === pathname
      ? `${mediaTitle.value} — yaneMedia`
      : getDocumentTitle(pathname);

  return (
    <>
      <title>{documentTitle}</title>
      <a
        ref={skipLinkRef}
        href={`#${mainContentId}`}
        className={[
          'fixed top-3 left-1/2 z-50 -translate-x-1/2 -translate-y-[calc(100%+1rem)]',
          'max-w-[calc(100%-1.5rem)] rounded-control border border-border',
          'bg-surface-elevated px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-text-primary',
          'shadow-overlay',
          'transition-transform duration-200 ease-out focus:translate-y-0',
          'motion-reduce:transition-none',
        ].join(' ')}
      >
        Перейти к основному содержимому
      </a>
      <Outlet />
    </>
  );
}
