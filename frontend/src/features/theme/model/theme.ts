export const themeModes = ['light', 'dark', 'system'] as const;

export type ThemeMode = (typeof themeModes)[number];

export type ResolvedTheme = Exclude<ThemeMode, 'system'>;

export function isThemeMode(value: unknown): value is ThemeMode {
  return themeModes.some((themeMode) => themeMode === value);
}

export function resolveTheme(themeMode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (themeMode === 'system') {
    return prefersDark ? 'dark' : 'light';
  }

  return themeMode;
}
