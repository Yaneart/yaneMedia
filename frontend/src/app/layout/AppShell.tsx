import { Outlet } from 'react-router';
import { routePaths } from '../router/routes';
import { primaryNavigationItems, secondaryNavigationItems } from '../router/navigation';
import { DesktopNavigation } from '@/widgets/desktop-navigation';
import { MobileNavigation } from '@/widgets/mobile-navigation';

export function AppShell() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="hidden md:block">
        <DesktopNavigation
          homePath={routePaths.home}
          primaryItems={primaryNavigationItems}
          secondaryItems={secondaryNavigationItems}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto bg-surface p-page md:m-2 md:ml-0 md:rounded-card md:shadow-surface">
          <Outlet />
        </main>
        <div className="shrink-0 md:hidden">
          <MobileNavigation homePath={routePaths.home} items={primaryNavigationItems} />
        </div>
      </div>
    </div>
  );
}
