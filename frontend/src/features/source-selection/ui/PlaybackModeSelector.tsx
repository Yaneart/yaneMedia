import { Button } from '@/shared';

import type { PlaybackMode } from '../model/sourceSelection';

export type PlaybackModeSelectorProps = {
  value: PlaybackMode;
  onChange: (mode: PlaybackMode) => void;
  compactDesktop?: boolean;
};

const modes: ReadonlyArray<{ value: PlaybackMode; label: string }> = [
  { value: 'embed', label: 'Встроенный плеер' },
  { value: 'direct', label: 'Прямое видео' },
];

export function PlaybackModeSelector({
  value,
  onChange,
  compactDesktop = false,
}: PlaybackModeSelectorProps) {
  return (
    <section
      aria-label="Режим просмотра"
      className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center"
    >
      <span
        className={[
          'shrink-0 text-caption text-text-secondary',
          compactDesktop ? 'min-[70rem]:sr-only' : '',
        ].join(' ')}
      >
        Режим
      </span>

      <div
        role="group"
        aria-label="Режим просмотра"
        className="grid min-w-0 grid-cols-2 rounded-control border border-border bg-control p-1"
      >
        {modes.map((mode) => {
          const isSelected = mode.value === value;

          return (
            <Button
              key={mode.value}
              size="custom"
              variant="bare"
              aria-pressed={isSelected}
              className={[
                'min-h-9 min-w-0 whitespace-nowrap px-3 text-sm',
                isSelected
                  ? 'bg-surface-elevated text-text-primary shadow-sm'
                  : 'text-text-secondary hover:bg-interactive-hover hover:text-text-primary',
              ].join(' ')}
              onClick={() => onChange(mode.value)}
            >
              <span className="truncate">{mode.label}</span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
