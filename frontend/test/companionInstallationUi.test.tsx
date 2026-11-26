import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'https://watch.example' });
const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { CompanionInstallation } =
  await import('../src/features/companion/ui/CompanionInstallation');

const release = 'https://github.com/Yaneart/yaneCompanion/releases/download/0.3.1';
const originalEnv = { ...process.env };

function showInstallation(shortInstall: string) {
  process.env.VITE_COMPANION_DOWNLOAD_BASE_URL = release;
  process.env.VITE_COMPANION_DOWNLOAD_VERSION = '0.3.1';
  process.env.VITE_COMPANION_SHORT_INSTALL = shortInstall;
  render(<CompanionInstallation />);
}

afterEach(cleanup);
afterAll(() => {
  for (const name of [
    'VITE_COMPANION_DOWNLOAD_BASE_URL',
    'VITE_COMPANION_DOWNLOAD_VERSION',
    'VITE_COMPANION_SHORT_INSTALL',
  ]) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  GlobalRegistrator.unregister();
});

test('uses the release URL when short installation URLs are unavailable', () => {
  showInstallation('false');
  fireEvent.click(screen.getByRole('radio', { name: 'Arch Linux' }));
  expect(screen.getByText(/sudo pacman -U/).textContent).toContain(release);
});

test('copies short commands for the selected Linux platform', async () => {
  const writeText = mock(async (_text: string) => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  showInstallation('true');

  fireEvent.click(screen.getByRole('radio', { name: 'Arch Linux' }));
  fireEvent.click(screen.getByRole('button', { name: 'Копировать команду «Через терминал»' }));
  expect(writeText).toHaveBeenCalledWith(
    'curl -fgLO https://watch.example/install/yane.pkg.tar.zst &&\nsudo pacman -U ./yane.pkg.tar.zst',
  );
  expect(await screen.findByText('Команда скопирована.')).toBeTruthy();

  fireEvent.click(screen.getByRole('radio', { name: 'Debian / Ubuntu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Копировать команду «Через терминал»' }));
  expect(writeText).toHaveBeenLastCalledWith(
    'curl -fgLO https://watch.example/install/yane.deb &&\nsudo apt install ./yane.deb',
  );
  await screen.findByText('Команда скопирована.');

  fireEvent.click(screen.getByRole('radio', { name: 'Windows' }));
  expect(screen.queryByRole('button', { name: /Копировать/ })).toBeNull();
  expect(screen.getByRole('link', { name: 'Скачать .exe' })).toBeTruthy();
});
