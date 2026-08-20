import {
  MoonFilledIcon,
  MoonIcon,
  SunFilledIcon,
  SunIcon,
  SystemThemeFilledIcon,
  SystemThemeIcon,
  type IconProps,
} from '@/shared';
import type { ComponentType } from 'react';
import type { ThemeMode } from '../model/theme';
import { useTheme } from '../model/useTheme';

type ThemeOption = {
  value: ThemeMode;
  label: string;
  icon: ComponentType<IconProps>;
  activeIcon: ComponentType<IconProps>;
};

const themeOptions = [
  {
    value: 'dark',
    label: 'Тёмная тема',
    icon: MoonIcon,
    activeIcon: MoonFilledIcon,
  },
  {
    value: 'system',
    label: 'Системная тема',
    icon: SystemThemeIcon,
    activeIcon: SystemThemeFilledIcon,
  },
  {
    value: 'light',
    label: 'Светлая тема',
    icon: SunIcon,
    activeIcon: SunFilledIcon,
  },
] satisfies ThemeOption[];

const indicatorPositionClasses: Record<ThemeMode, string> = {
  dark: 'translate-x-0',
  system: 'translate-x-full',
  light: 'translate-x-[200%]',
};

export function ThemeToggle() {
  const { themeMode, setThemeMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="Тема оформления"
      className="relative grid h-10 w-28 grid-cols-3 rounded-control border border-navigation-border bg-background p-1"
    >
      <span
        aria-hidden="true"
        className={[
          'pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)]',
          'rounded-lg bg-surface-elevated shadow-sm',
          'transition-transform duration-250 ease-out motion-reduce:transition-none',
          indicatorPositionClasses[themeMode],
        ].join(' ')}
      />

      {themeOptions.map((option) => {
        const isActive = option.value === themeMode;
        const Icon = isActive ? option.activeIcon : option.icon;

        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={isActive}
            title={option.label}
            className={[
              'relative z-10 flex items-center justify-center rounded-lg',
              'transition-[color,transform] duration-200 ease-out',
              'active:scale-[0.94] active:duration-75',
              'motion-reduce:transform-none motion-reduce:transition-none',
              isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
            onClick={() => setThemeMode(option.value)}
          >
            <Icon className="size-5" />
          </button>
        );
      })}
    </div>
  );
}
