import { Outlet, useLocation, useNavigate } from 'react-router';
import { routePaths } from '../router/routes';
import { primaryNavigationItems, secondaryNavigationItems } from '../router/navigation';
import { DesktopNavigation } from '@/widgets/desktop-navigation';
import { MobileNavigation } from '@/widgets/mobile-navigation';
import { MobileHeader } from '@/widgets/mobile-header';
import { AppShellWatermarks } from './AppShellWatermarks';
import { usePlaybackSession } from '@/features/playback-session';
import { WatchDock } from '@/widgets/watch-dock';

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const { session, endSession } = usePlaybackSession();

  const isHomePage = pathname === routePaths.home;

  const activeMediaPath = session ? `/media/${encodeURIComponent(session.mediaRef)}` : null;
  const normalizedPathname = pathname.replace(/\/+$/, '') || routePaths.home;
  const isActiveMediaPage = activeMediaPath === normalizedPathname;
  return (
    <div className="relative isolate flex h-dvh overflow-hidden bg-background">
      <div className="relative hidden md:block">
        <AppShellWatermarks />
        <div className="relative z-10">
          <DesktopNavigation
            homePath={routePaths.home}
            profilePath={routePaths.login}
            primaryItems={primaryNavigationItems}
            secondaryItems={secondaryNavigationItems}
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
            profilePath={routePaths.login}
            overlay={isHomePage}
          />
        </div>
        <main className="relative z-10 min-h-0 flex-1 overflow-y-auto bg-surface p-page [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:m-4 md:ml-0 md:rounded-card md:shadow-surface">
          <Outlet />
        </main>
        {session && activeMediaPath && !isActiveMediaPage && (
          <div className="relative z-20 shrink-0 bg-surface px-1 pb-1 md:mr-4 md:mb-4 md:bg-transparent md:px-0 md:pb-0">
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
          <MobileNavigation homePath={routePaths.home} items={primaryNavigationItems} />
        </div>
      </div>
    </div>
  );
}
