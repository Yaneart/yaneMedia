import { useId, useState } from 'react';
import { YaneMark } from '@/shared';
import { CheckIcon } from '@/shared/ui/Icons';
import DownloadIcon from '@mingcute/react/core-regular/download';
import LinuxIcon from '@mingcute/react/core-regular/linux';
import TerminalIcon from '@mingcute/react/core-regular/terminal';
import WindowsIcon from '@mingcute/react/core-regular/windows';
import {
  companionDownload,
  companionReleaseHistory,
  detectCompanionPlatform,
  type CompanionPlatform,
} from '../model/installation';

const platforms = [
  {
    value: 'windows',
    label: 'Windows',
    detail: 'Windows 10 или Windows 11',
    extension: '.exe',
    icon: WindowsIcon,
  },
  {
    value: 'debian',
    label: 'Debian / Ubuntu',
    detail: 'Debian 12 или Ubuntu 24.04',
    extension: '.deb',
    icon: LinuxIcon,
  },
  {
    value: 'arch',
    label: 'Arch Linux',
    detail: 'Пакет для установки через pacman',
    extension: '.pkg.tar.zst',
    icon: TerminalIcon,
  },
] as const;

export function CompanionInstallation() {
  const group = useId();
  const heading = useId();
  const [platform, setPlatform] = useState<CompanionPlatform | ''>(() =>
    detectCompanionPlatform(navigator.userAgent),
  );
  const selected = platforms.find(({ value }) => value === platform);
  const download = companionDownload(platform);
  const releaseHistory = download && companionReleaseHistory(download);
  return (
    <section
      aria-labelledby={heading}
      className="relative isolate grid gap-3 overflow-hidden rounded-overlay border border-context-border bg-linear-to-br from-watermark/18 via-watermark/5 to-transparent p-3 sm:p-4"
    >
      <YaneMark
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -right-11 -z-10 size-44 rotate-12 text-watermark/14"
      />
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={heading} className="font-semibold">
          Установка
        </h3>
        <span className="text-xs text-text-secondary">64-битные системы</span>
      </div>
      <div
        role="radiogroup"
        aria-label="Операционная система"
        className="grid grid-cols-3 gap-1.5 sm:gap-2"
      >
        {platforms.map(({ value, label, extension, icon: Icon }) => (
          <label
            key={value}
            className="relative flex min-w-0 cursor-pointer flex-col gap-1 rounded-control border border-border bg-control px-2 py-2.5 transition-colors hover:border-watermark/55 hover:bg-control-hover has-checked:border-watermark/85 has-checked:bg-watermark/18 has-focus-visible:ring-2 has-focus-visible:ring-watermark motion-reduce:transition-none sm:p-3"
          >
            <input
              className="sr-only"
              type="radio"
              name={group}
              value={value}
              checked={platform === value}
              onChange={() => setPlatform(value)}
            />
            <span className="mb-1 flex items-center justify-between gap-1 text-accent-text">
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              {platform === value && <CheckIcon aria-hidden="true" className="size-4 shrink-0" />}
            </span>
            <span className="grow text-xs leading-tight font-semibold sm:text-sm">{label}</span>
            <span aria-hidden="true" className="text-xs text-text-secondary">
              {extension}
            </span>
          </label>
        ))}
      </div>
      {selected && (
        <div className="grid gap-2">
          <p className="text-xs text-text-secondary">{selected.detail}</p>
          {download && (
            <a
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-watermark/50 bg-watermark/14 px-3 text-sm font-semibold text-accent-text transition-colors hover:bg-watermark/24 focus-visible:outline-2 focus-visible:outline-watermark motion-reduce:transition-none"
              href={download}
            >
              <DownloadIcon aria-hidden="true" className="size-4" />
              Скачать {selected.extension}
            </a>
          )}
          {releaseHistory && (
            <a className="self-start text-xs text-accent-text underline" href={releaseHistory}>
              Все версии на GitHub
            </a>
          )}
        </div>
      )}
    </section>
  );
}
