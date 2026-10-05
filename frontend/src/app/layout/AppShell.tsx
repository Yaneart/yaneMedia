import { matchPath, Outlet, useLocation, useNavigate } from 'react-router';
import { routePaths } from '../router/routes';
import { primaryNavigationItems, secondaryNavigationItems } from '../router/navigation';
import { preloadAnimePage, preloadMoviesPage, preloadSeriesPage } from '../router/lazyPages';
import { DesktopNavigation } from '@/widgets/desktop-navigation';
import { MobileNavigation } from '@/widgets/mobile-navigation';
import { MobileHeader } from '@/widgets/mobile-header';
import { AppShellWatermarks } from './AppShellWatermarks';
import { usePlaybackSession } from '@/features/playback-session';
import { ScrollRestorationProvider, useAppScrollRestoration } from '@/features/scroll-restoration';
import { WatchDock } from '@/widgets/watch-dock';
import { mediaCatalogQueryOptions } from '@/widgets/media-catalog';
import { useQueryClient } from '@tanstack/react-query';
import type { MediaType } from '@/entities/media';
import { mainContentId } from '@/shared';
import { claimIntentPrefetch } from '@/shared/lib/intentPrefetch';
import { useRef } from 'react';
import { isActivePlaybackMediaRoute } from './watchDockVisibility';

const catalogTypeByPath: Partial<Record<string, MediaType>> = {
  [routePaths.movies]: 'movie',
  [routePaths.series]: 'series',
  [routePaths.anime]: 'anime',
};

const catalogPageLoaderByPath: Partial<Record<string, () => Promise<unknown>>> = {
  [routePaths.movies]: preloadMoviesPage,
  [routePaths.series]: preloadSeriesPage,
  [routePaths.anime]: preloadAnimePage,
};

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefetchedCatalogPathsRef = useRef(new Set<string>());

  const { session, endSession } = usePlaybackSession();
  const { cancelPendingRestoration, contentRef, mainRef, rowScrollRestoration, saveMainPosition } =
    useAppScrollRestoration();

  const isHomePage = pathname === routePaths.home;

  const normalizedPathname = pathname.replace(/\/+$/, '') || routePaths.home;
  const mediaRouteMatch = matchPath(routePaths.media, normalizedPathname);
  const isActivePlaybackMediaPage = isActivePlaybackMediaRoute(
    session,
    mediaRouteMatch?.params.mediaRef,
  );
  const activeMediaPath = session ? `/media/${encodeURIComponent(session.mediaRef)}` : null;
  const showWatchDock = session && activeMediaPath && !isActivePlaybackMediaPage;
  const prefetchCatalog = (path: string) => {
    const type = catalogTypeByPath[path];
    const preloadPage = catalogPageLoaderByPath[path];

    if (type && claimIntentPrefetch(prefetchedCatalogPathsRef.current, path)) {
      if (preloadPage) {
        void preloadPage().catch(() => undefined);
      }

      void queryClient.prefetchInfiniteQuery({
        ...mediaCatalogQueryOptions(type),
        retry: false,
      });
    }
  };

  return (
    <div className="relative isolate flex h-dvh overflow-hidden bg-background">
      <div className="relative z-20 hidden md:block">
        <AppShellWatermarks />
        <div className="relative z-10">
          <DesktopNavigation
            homePath={routePaths.home}
            profilePath={routePaths.login}
            primaryItems={primaryNavigationItems}
            secondaryItems={secondaryNavigationItems}
            onItemIntent={prefetchCatalog}
            playbackDock={
              showWatchDock ? (
                <WatchDock
                  variant="sidebar"
                  mediaTitle={session.mediaSnapshot.title}
                  artwork={session.mediaSnapshot.artwork}
                  session={session}
                  onExpand={() => navigate(activeMediaPath)}
                  onClose={endSession}
                />
              ) : null
            }
          />
        </div>
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <AppShellWatermarks area="frame" />
        <div
          className={['z-20 md:hidden', isHomePage ? 'absolute inset-x-0 top-0' : 'shrink-0'].join(
            ' ',
          )}
        >
          <MobileHeader
            homePath={routePaths.home}
            favoritesPath={routePaths.favorites}
            historyPath={routePaths.history}
            profilePath={routePaths.login}
            overlay={isHomePage}
          />
        </div>
        <main
          id={mainContentId}
          ref={mainRef}
          tabIndex={-1}
          className="relative z-10 min-h-0 flex-1 overflow-y-auto bg-[var(--theme-home-background)] p-page [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:m-4 md:ml-0 md:rounded-card md:shadow-surface"
          onKeyDownCapture={cancelPendingRestoration}
          onPointerDownCapture={cancelPendingRestoration}
          onScroll={saveMainPosition}
          onTouchStartCapture={cancelPendingRestoration}
          onWheelCapture={cancelPendingRestoration}
        >
          <ScrollRestorationProvider value={rowScrollRestoration}>
            <div ref={contentRef}>
              <Outlet />
            </div>
          </ScrollRestorationProvider>
        </main>
        {showWatchDock && (
          <div className="pointer-events-none absolute inset-x-4 bottom-[4.75rem] z-30 sm:inset-x-7 md:hidden">
            <WatchDock
              mediaTitle={session.mediaSnapshot.title}
              artwork={session.mediaSnapshot.artwork}
              session={session}
              onExpand={() => navigate(activeMediaPath)}
              onClose={endSession}
            />
          </div>
        )}
        <div className="shrink-0 bg-surface md:hidden pl-1 pr-1">
          <MobileNavigation
            homePath={routePaths.home}
            items={primaryNavigationItems}
            onItemIntent={prefetchCatalog}
          />
        </div>
      </div>
    </div>
  );
}
