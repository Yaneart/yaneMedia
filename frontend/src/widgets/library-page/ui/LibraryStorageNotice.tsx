import { DeviceIcon } from '@/shared';

export function LibraryStorageNotice() {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-card bg-watermark/10 px-4 py-3 text-text-secondary">
      <DeviceIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-watermark" />
      <p className="text-caption">
        В гостевом режиме избранное и история хранятся только в этом браузере на текущем устройстве
        и не переносятся автоматически.
      </p>
    </div>
  );
}
