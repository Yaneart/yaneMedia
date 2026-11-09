import { useState } from 'react';
import {
  companionDownload,
  detectCompanionPlatform,
  type CompanionPlatform,
} from '../model/installation';

export function CompanionInstallation() {
  const [platform, setPlatform] = useState<CompanionPlatform | ''>(() =>
    detectCompanionPlatform(navigator.userAgent),
  );
  const download = companionDownload(platform);
  return (
    <div className="flex flex-col gap-2 rounded-control border border-border p-3 text-sm">
      <label className="flex flex-col gap-1">
        Установка yaneCompanion · x64
        <select
          aria-label="Система для установки помощника"
          className="rounded-control border border-border bg-popover p-2 text-text-primary"
          value={platform}
          onChange={(event) => setPlatform(event.target.value as CompanionPlatform | '')}
        >
          <option value="">Выберите систему</option>
          <option value="windows">Windows 11</option>
          <option value="debian">Debian 12 / Ubuntu 24.04</option>
          <option value="arch">Arch Linux</option>
        </select>
      </label>
      {download ? (
        <a className="font-medium text-accent-text underline" href={download}>
          Скачать установщик{' '}
          {platform === 'windows' ? '.exe' : platform === 'arch' ? '.pkg.tar.zst' : '.deb'}
        </a>
      ) : (
        <p className="text-text-secondary">
          {platform
            ? 'Установщики пока не опубликованы для этого сайта.'
            : 'Поддерживаются Windows и Linux на компьютерах x64.'}
        </p>
      )}
      <a className="font-medium text-accent-text underline" href="yanecompanion://open">
        Открыть установленный yaneCompanion
      </a>
      <p className="text-text-secondary">
        После установки откройте помощник и нажмите «Подключить» здесь. Если адрес сайта ещё не
        задан, сохраните его в окне помощника:
      </p>
      <p className="select-all break-all font-medium">{location.origin}</p>
      <p className="text-text-secondary">
        Сбой подключения может быть связан с запуском помощника или разрешением браузера.
      </p>
    </div>
  );
}
