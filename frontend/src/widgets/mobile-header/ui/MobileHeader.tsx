import { ThemeToggle } from '@/features/theme';
import { Logo, ProfileIcon } from '@/shared';
import { NavLink } from 'react-router';

type MobileHeaderProps = {
  homePath: string;
  profilePath: string;
};

export function MobileHeader({ homePath, profilePath }: MobileHeaderProps) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 bg-surface px-page">
      <NavLink
        to={homePath}
        aria-label="Перейти на главную"
        className="flex shrink-0 items-center rounded-control"
      >
        <Logo compact />
      </NavLink>
      <div className="flex items-center gap-2">
        <ThemeToggle />

        <NavLink
          to={profilePath}
          aria-label="Войти"
          className="flex min-h-10 items-center justify-center gap-2 rounded-control border border-border bg-background px-3 text-caption font-semibold text-text-primary transition-colors duration-150 hover:bg-interactive-hover"
        >
          <ProfileIcon className="size-5 shrink-0" />
        </NavLink>
      </div>
    </header>
  );
}
