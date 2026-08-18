import { ThemeToggle } from '@/features/theme';
import {
  FavoriteFilledIcon,
  FavoriteIcon,
  HistoryFilledIcon,
  HistoryIcon,
  Logo,
  MoreIcon,
  Popover,
  ProfileIcon,
} from '@/shared';
import { NavLink, useLocation } from 'react-router';

type MobileHeaderProps = {
  homePath: string;
  favoritesPath: string;
  historyPath: string;
  profilePath: string;
  overlay?: boolean;
};

export function MobileHeader({
  homePath,
  favoritesPath,
  historyPath,
  profilePath,
  overlay = false,
}: MobileHeaderProps) {
  const { pathname } = useLocation();
  const isLibraryRoute = pathname === favoritesPath || pathname === historyPath;

  return (
    <header
      className={[
        'pt-[env(safe-area-inset-top)]',
        overlay ? 'home-mobile-header-overlay' : 'bg-surface',
      ].join(' ')}
    >
      <div className="flex min-h-16 items-center justify-between gap-4 px-page">
        <NavLink
          to={homePath}
          aria-label="Перейти на главную"
          className={[
            'flex shrink-0 items-center rounded-control',
            'transition-transform duration-200 ease-out active:scale-[0.98] active:duration-75',
            'motion-reduce:transform-none motion-reduce:transition-none',
          ].join(' ')}
        >
          <Logo compact className={overlay ? '[&>span:first-child]:text-hero-text' : ''} />
        </NavLink>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <Popover
            trigger={<MoreIcon className="size-5" />}
            triggerLabel="Открыть разделы пользователя"
            align="center"
            triggerSize="custom"
            triggerVariant="bare"
            panelClassName="min-w-0 rounded-control bg-background p-1"
            triggerClassName={[
              'size-10 shrink-0 rounded-control border bg-background',
              'transition-[background-color,border-color,color,transform] duration-200 ease-out',
              'hover:bg-interactive-hover active:scale-[0.97] active:duration-75',
              'motion-reduce:transform-none motion-reduce:transition-none',
              isLibraryRoute
                ? 'border-watermark/70 bg-watermark/15 text-watermark'
                : 'border-border text-text-primary',
            ].join(' ')}
          >
            {(closePopover) => (
              <nav aria-label="Разделы пользователя" className="flex items-center gap-1">
                <NavLink
                  to={favoritesPath}
                  aria-label="Открыть избранное"
                  title="Избранное"
                  className={({ isActive }) =>
                    [
                      'flex size-8 shrink-0 items-center justify-center rounded-lg border',
                      'transition-[background-color,border-color,color] duration-200 ease-out',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watermark/60',
                      isActive
                        ? 'border-watermark/70 bg-watermark/15 text-watermark'
                        : 'border-border bg-background text-text-primary hover:bg-interactive-hover',
                    ].join(' ')
                  }
                  onClick={closePopover}
                >
                  {({ isActive }) => {
                    const FavoriteStateIcon = isActive ? FavoriteFilledIcon : FavoriteIcon;

                    return <FavoriteStateIcon className="size-5 shrink-0" />;
                  }}
                </NavLink>

                <NavLink
                  to={historyPath}
                  aria-label="Открыть историю"
                  title="История"
                  className={({ isActive }) =>
                    [
                      'flex size-8 shrink-0 items-center justify-center rounded-lg border',
                      'transition-[background-color,border-color,color] duration-200 ease-out',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watermark/60',
                      isActive
                        ? 'border-watermark/70 bg-watermark/15 text-watermark'
                        : 'border-border bg-background text-text-primary hover:bg-interactive-hover',
                    ].join(' ')
                  }
                  onClick={closePopover}
                >
                  {({ isActive }) => {
                    const HistoryStateIcon = isActive ? HistoryFilledIcon : HistoryIcon;

                    return <HistoryStateIcon className="size-5 shrink-0" />;
                  }}
                </NavLink>
              </nav>
            )}
          </Popover>

          <NavLink
            to={profilePath}
            aria-label="Войти"
            className={[
              'flex min-h-10 items-center justify-center gap-2 rounded-control',
              'border border-border bg-background px-3 text-caption font-semibold text-text-primary',
              'transition-[background-color,color,transform] duration-200 ease-out',
              'hover:bg-interactive-hover active:scale-[0.97] active:duration-75',
              'motion-reduce:transform-none motion-reduce:transition-none',
            ].join(' ')}
          >
            <ProfileIcon className="size-5 shrink-0" />
          </NavLink>
        </div>
      </div>
    </header>
  );
}
