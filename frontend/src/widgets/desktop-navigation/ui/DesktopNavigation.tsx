import { ThemeToggle } from '@/features/theme';
import { Logo, type IconProps } from '@/shared';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router';

type DesktopNavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
};

type DesktopNavigationProps = {
  homePath: string;
  primaryItems: readonly DesktopNavigationItem[];
  secondaryItems: readonly DesktopNavigationItem[];
};

function getLinkClassName({ isActive }: { isActive: boolean }) {
  return [
    'flex min-h-11 gap-3 items-center rounded-control px-3 text-sm font-semibold',
    'transition-colors duration-150',
    isActive
      ? 'bg-surface-elevated text-text-primary'
      : 'text-text-secondary hover:bg-interactive-hover hover:text-text-primary',
  ].join(' ');
}

export function DesktopNavigation({
  homePath,
  primaryItems,
  secondaryItems,
}: DesktopNavigationProps) {
  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col px-4 py-5">
      <NavLink
        to={homePath}
        aria-label="Перейти на главную"
        className="mb-8 w-fit rounded-control p-2"
      >
        <Logo />
      </NavLink>

      <nav aria-label="Основная навигация">
        <ul className="flex flex-col gap-1">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <NavLink to={item.path} end={item.path === homePath} className={getLinkClassName}>
                  <Icon className="size-5 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Личная навигация" className="mt-6">
        <ul className="flex flex-col gap-1">
          {secondaryItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <NavLink to={item.path} className={getLinkClassName}>
                  <Icon className="size-5 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto pt-6">
        <ThemeToggle />
      </div>
    </aside>
  );
}
