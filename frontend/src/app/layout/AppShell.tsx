import { Outlet } from 'react-router';
import { routePaths } from '../router/routes';
import { primaryNavigationItems, secondaryNavigationItems } from '../router/navigation';
import { DesktopNavigation } from '@/widgets/desktop-navigation';
import { MobileNavigation } from '@/widgets/mobile-navigation';
import { MobileHeader } from '@/widgets/mobile-header';

export function AppShell() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="hidden md:block">
        <DesktopNavigation
          homePath={routePaths.home}
          profilePath={routePaths.login}
          primaryItems={primaryNavigationItems}
          secondaryItems={secondaryNavigationItems}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 md:hidden">
          <MobileHeader homePath={routePaths.home} profilePath={routePaths.login} />
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto bg-surface p-page [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:m-4 md:ml-0 md:rounded-card md:shadow-surface">
          <Outlet />
        </main>
        <div className="shrink-0 bg-surface md:hidden pl-1 pr-1">
          <MobileNavigation homePath={routePaths.home} items={primaryNavigationItems} />
        </div>
      </div>
    </div>
  );
}
