import { ThemeToggle } from '@/features/theme';
import { Logo, ProfileIcon, type IconProps } from '@/shared';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router';

type DesktopNavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
  activeIcon: ComponentType<IconProps>;
};

type DesktopNavigationProps = {
  homePath: string;
  profilePath: string;
  primaryItems: readonly DesktopNavigationItem[];
  secondaryItems: readonly DesktopNavigationItem[];
};

function getLinkClassName({ isActive }: { isActive: boolean }) {
  return [
    'flex min-h-12 items-center gap-3 rounded-control px-3 text-body font-semibold',
    'transition-[background-color,color,transform] duration-200 ease-out',
    'active:scale-[0.985] active:duration-75',
    'motion-reduce:transform-none motion-reduce:transition-none',
    isActive
      ? 'bg-surface-elevated text-text-primary'
      : 'text-text-secondary hover:bg-interactive-hover hover:text-text-primary',
  ].join(' ');
}

export function DesktopNavigation({
  homePath,
  primaryItems,
  secondaryItems,
  profilePath,
}: DesktopNavigationProps) {
  return (
    <aside className="flex h-dvh w-64 shrink-0 flex-col px-5 py-6">
      <NavLink
        to={homePath}
        aria-label="Перейти на главную"
        className={[
          'mb-8 w-fit rounded-control p-2',
          'transition-transform duration-200 ease-out active:scale-[0.98] active:duration-75',
          'motion-reduce:transform-none motion-reduce:transition-none',
        ].join(' ')}
      >
        <Logo />
      </NavLink>

      <nav aria-label="Основная навигация">
        <ul className="flex flex-col gap-2">
          {primaryItems.map((item) => {
            return (
              <li key={item.path}>
                <NavLink to={item.path} end={item.path === homePath} className={getLinkClassName}>
                  {({ isActive }) => {
                    const Icon = isActive ? item.activeIcon : item.icon;

                    return (
                      <>
                        <Icon className="size-5 shrink-0" />
                        {item.label}
                      </>
                    );
                  }}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Личная навигация" className="mt-8">
        <ul className="flex flex-col gap-2">
          {secondaryItems.map((item) => {
            return (
              <li key={item.path}>
                <NavLink to={item.path} className={getLinkClassName}>
                  {({ isActive }) => {
                    const Icon = isActive ? item.activeIcon : item.icon;

                    return (
                      <>
                        <Icon className="size-5 shrink-0" />
                        {item.label}
                      </>
                    );
                  }}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto flex items-center gap-2 px-2 pt-6">
        <ThemeToggle />

        <NavLink
          to={profilePath}
          aria-label="Войти"
          className={[
            'flex size-10 shrink-0 items-center justify-center rounded-control',
            'border border-navigation-border bg-background text-text-primary hover:bg-interactive-hover',
            'transition-[background-color,border-color,color,transform] duration-200 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20',
            'active:scale-[0.96] active:duration-75',
            'motion-reduce:transform-none motion-reduce:transition-none',
          ].join(' ')}
        >
          <ProfileIcon className="size-5" />
        </NavLink>
      </div>
    </aside>
  );
}
