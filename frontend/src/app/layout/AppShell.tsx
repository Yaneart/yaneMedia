import { Outlet } from 'react-router';
import { DesktopNavigation } from '@/widgets/desktop-navigation';
import { primaryNavigationItems, secondaryNavigationItems } from '../router/navigation';
import { routePaths } from '../router/routes';

export function AppShell() {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <DesktopNavigation
        homePath={routePaths.home}
        primaryItems={primaryNavigationItems}
        secondaryItems={secondaryNavigationItems}
      />
      <main className="m-2 ml-0 flex-1 overflow-y-auto rounded-card bg-surface p-page shadow-surface">
        <Outlet />
      </main>
    </div>
  );
}
