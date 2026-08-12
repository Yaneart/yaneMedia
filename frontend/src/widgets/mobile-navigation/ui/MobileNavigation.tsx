import type { IconProps } from '@/shared';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router';

type MobileNavigationItem = {
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
};

type MobileNavigationProps = {
  homePath: string;
  items: readonly MobileNavigationItem[];
};

function getLinkClassName({ isActive }: { isActive: boolean }) {
  return [
    'flex min-w-0 flex-1 flex-col items-center justify-center gap-1',
    'px-1 py-2 text-caption',
    'transition-[color,transform] duration-200 ease-out',
    'active:scale-[0.97] active:duration-75',
    'motion-reduce:transform-none motion-reduce:transition-none',
    isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
  ].join(' ');
}

export function MobileNavigation({ homePath, items }: MobileNavigationProps) {
  return (
    <nav
      aria-label="Основная навигация"
      className="overflow-hidden rounded-t-card border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex min-h-16">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.path} className="flex min-w-0 flex-1">
              <NavLink to={item.path} end={item.path === homePath} className={getLinkClassName}>
                <Icon className="size-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
