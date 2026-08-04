import { isThemeMode, type ThemeMode } from './theme';

export const THEME_STORAGE_KEY = 'yanemedia-theme';

export function loadThemeMode(): ThemeMode {
  try {
    const storageThemeMode = window.localStorage.getItem(THEME_STORAGE_KEY);

    return isThemeMode(storageThemeMode) ? storageThemeMode : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemeMode(themeMode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  } catch {
    // Тема продолжит работать только в текущем сеансе.
  }
}
