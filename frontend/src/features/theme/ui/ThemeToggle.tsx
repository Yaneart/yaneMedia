import { MoonIcon, SunIcon, SystemThemeIcon, type IconProps } from '@/shared';
import type { ComponentType } from 'react';
import type { ThemeMode } from '../model/theme';
import { useTheme } from '../model/useTheme';

type ThemeOption = {
  value: ThemeMode;
  label: string;
  icon: ComponentType<IconProps>;
};

const themeOptions = [
  {
    value: 'dark',
    label: 'Тёмная тема',
    icon: MoonIcon,
  },
  {
    value: 'system',
    label: 'Системная тема',
    icon: SystemThemeIcon,
  },
  {
    value: 'light',
    label: 'Светлая тема',
    icon: SunIcon,
  },
] satisfies ThemeOption[];

const indicatorPositions: Record<ThemeMode, string> = {
  dark: '0%',
  system: '100%',
  light: '200%',
};

export function ThemeToggle() {
  const { themeMode, setThemeMode } = useTheme();

  return (
    <div
      role="group"
      aria-label="Тема оформления"
      className="relative grid h-10 w-28 grid-cols-3 rounded-control border border-border bg-background p-1"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 rounded-lg bg-surface-elevated shadow-sm transition-transform duration-200"
        style={{
          width: 'calc((100% - 0.5rem) / 3)',
          transform: `translateX(${indicatorPositions[themeMode]})`,
        }}
      />

      {themeOptions.map((option) => {
        const Icon = option.icon;
        const isActive = option.value === themeMode;

        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={isActive}
            title={option.label}
            className={[
              'relative z-10 flex items-center justify-center rounded-lg',
              'transition-colors duration-150',
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
