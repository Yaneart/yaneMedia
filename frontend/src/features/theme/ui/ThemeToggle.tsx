import type { ChangeEvent } from 'react';
import { isThemeMode } from '../model/theme';
import { useTheme } from '../model/useTheme';

export function ThemeToggle() {
  const { themeMode, setThemeMode } = useTheme();

  const handleThemeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextThemeMode = e.target.value;

    if (isThemeMode(nextThemeMode)) {
      setThemeMode(nextThemeMode);
    }
  };

  return (
    <label>
      <span className="sr-only">Тема оформления:</span>
      <select value={themeMode} onChange={handleThemeChange}>
        <option value="system">Системная</option>
        <option value="dark">Тёмная</option>
        <option value="light">Светлая</option>
      </select>
    </label>
  );
}
