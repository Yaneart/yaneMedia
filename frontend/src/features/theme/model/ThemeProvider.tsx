import { useEffect, useState, type ReactNode } from 'react';
import { resolveTheme, type ThemeMode } from './theme';
import { ThemeContext } from './themeContext';
import { loadThemeMode, saveThemeMode } from './themeStorage';

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(loadThemeMode);

  useEffect(() => {
    const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolvedTheme = resolveTheme(themeMode, systemThemeQuery.matches);

      document.documentElement.dataset.theme = resolvedTheme;
    };

    applyTheme();

    if (themeMode !== 'system') {
      return;
    }

    systemThemeQuery.addEventListener('change', applyTheme);

    return () => {
      systemThemeQuery.removeEventListener('change', applyTheme);
    };
  }, [themeMode]);

  const setThemeMode = (nextThemeMode: ThemeMode) => {
    saveThemeMode(nextThemeMode);
    setThemeModeState(nextThemeMode);
  };

  return <ThemeContext value={{ themeMode, setThemeMode }}>{children}</ThemeContext>;
}
