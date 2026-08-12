import { createContext } from 'react';
import type { ThemeMode } from './theme';

export type ThemeContextValue = {
  themeMode: ThemeMode;
  setThemeMode: (themeMode: ThemeMode) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
