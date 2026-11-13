import { Outlet, useLocation } from 'react-router';
import { routePaths } from '../router/routes';
import { primaryNavigationItems, secondaryNavigationItems } from '../router/navigation';
import { preloadAnimePage, preloadMoviesPage, preloadSeriesPage } from '../router/lazyPages';
import { DesktopNavigation } from '@/widgets/desktop-navigation';
import { MobileNavigation } from '@/widgets/mobile-navigation';
import { MobileHeader } from '@/widgets/mobile-header';
import { AppShellWatermarks } from './AppShellWatermarks';
import { ScrollRestorationProvider, useAppScrollRestoration } from '@/features/scroll-restoration';
import { mediaCatalogQueryOptions } from '@/widgets/media-catalog';
import { useQueryClient } from '@tanstack/react-query';
import type { MediaType } from '@/entities/media';
import { mainContentId } from '@/shared';
import { claimIntentPrefetch } from '@/shared/lib/intentPrefetch';
import { useRef, useState } from 'react';
import { CompanionDialog, useCompanionConnection } from '@/features/companion';

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
  const queryClient = useQueryClient();
  const prefetchedCatalogPathsRef = useRef(new Set<string>());
  const companion = useCompanionConnection();
  const [companionOpen, setCompanionOpen] = useState(false);

  const { cancelPendingRestoration, contentRef, mainRef, rowScrollRestoration, saveMainPosition } =
    useAppScrollRestoration();

  const isHomePage = pathname === routePaths.home;
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
      <CompanionDialog
        connection={companion}
        open={companionOpen}
        onClose={() => setCompanionOpen(false)}
      />
      <div className="relative z-20 hidden lg:block">
        <AppShellWatermarks />
        <div className="relative z-10">
          <DesktopNavigation
            homePath={routePaths.home}
            profilePath={routePaths.profile}
            primaryItems={primaryNavigationItems}
            secondaryItems={secondaryNavigationItems}
            onItemIntent={prefetchCatalog}
            onCompanionClick={() => setCompanionOpen(true)}
            companionOpen={companionOpen}
          />
        </div>
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <AppShellWatermarks area="frame" />
        <div className="absolute inset-x-0 top-0 z-20 lg:hidden">
          <MobileHeader
            homePath={routePaths.home}
            favoritesPath={routePaths.favorites}
            historyPath={routePaths.history}
            profilePath={routePaths.profile}
            onCompanionClick={() => setCompanionOpen(true)}
          />
        </div>
        <main
          id={mainContentId}
          ref={mainRef}
          tabIndex={-1}
          className="relative z-10 min-h-0 flex-1 overflow-y-auto bg-[var(--theme-home-background)] p-page [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:m-4 lg:ml-0 lg:rounded-card lg:shadow-surface"
          onKeyDownCapture={cancelPendingRestoration}
          onPointerDownCapture={cancelPendingRestoration}
          onScroll={saveMainPosition}
          onTouchStartCapture={cancelPendingRestoration}
          onWheelCapture={cancelPendingRestoration}
        >
          <ScrollRestorationProvider value={rowScrollRestoration}>
            <div
              ref={contentRef}
              className={[
                'pb-[calc(env(safe-area-inset-bottom)+4rem)] lg:pb-0',
                isHomePage ? '' : 'pt-[calc(env(safe-area-inset-top)+4rem)] lg:pt-0',
              ].join(' ')}
            >
              <Outlet />
            </div>
          </ScrollRestorationProvider>
        </main>
        <div className="absolute inset-x-0 bottom-0 z-20 bg-transparent px-1 lg:hidden">
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
