import { ThemeToggle } from '@/features/theme';
import { FavoriteFilledIcon, FavoriteIcon, Logo, ProfileIcon } from '@/shared';
import { NavLink } from 'react-router';

type MobileHeaderProps = {
  homePath: string;
  favoritesPath: string;
  profilePath: string;
  overlay?: boolean;
};

export function MobileHeader({
  homePath,
  favoritesPath,
  profilePath,
  overlay = false,
}: MobileHeaderProps) {
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

          <NavLink
            to={favoritesPath}
            aria-label="Открыть избранное"
            className={({ isActive }) =>
              [
                'flex size-10 shrink-0 items-center justify-center rounded-control border bg-background',
                'transition-[background-color,border-color,color,transform] duration-200 ease-out',
                'hover:bg-interactive-hover active:scale-[0.97] active:duration-75',
                'motion-reduce:transform-none motion-reduce:transition-none',
                isActive
                  ? 'border-watermark/70 bg-watermark/15 text-watermark'
                  : 'border-border text-text-primary',
              ].join(' ')
            }
          >
            {({ isActive }) =>
              isActive ? (
                <FavoriteFilledIcon className="size-5" />
              ) : (
                <FavoriteIcon className="size-5" />
              )
            }
          </NavLink>

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
