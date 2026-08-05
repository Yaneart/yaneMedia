import { loadThemeMode, saveThemeMode } from './themeStorage';
import { resolveTheme, type ThemeMode } from './theme';
import { useEffect, useState } from 'react';

export function useTheme() {
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

  return {
    themeMode,
    setThemeMode,
  };
}
