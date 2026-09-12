import { DeviceIcon } from '@/shared';

type LibraryStorageNoticeProps = {
  mode?: 'guest' | 'account';
  resource?: 'favorites' | 'history';
};

export function LibraryStorageNotice({
  mode = 'guest',
  resource = 'favorites',
}: LibraryStorageNoticeProps) {
  const accountMessage =
    resource === 'history'
      ? 'История хранится в аккаунте и доступна после входа на других устройствах.'
      : 'Избранное хранится в аккаунте и доступно после входа на других устройствах.';

  return (
    <div className="mb-5 flex items-start gap-3 rounded-card bg-watermark/10 px-4 py-3 text-text-secondary">
      <DeviceIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-watermark" />
      <p className="text-caption">
        {mode === 'account'
          ? accountMessage
          : 'В гостевом режиме избранное и история хранятся только в этом браузере на текущем устройстве.'}
      </p>
    </div>
  );
}
