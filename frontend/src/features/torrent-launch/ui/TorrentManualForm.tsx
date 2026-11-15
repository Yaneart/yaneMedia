import type { FormEvent } from 'react';
import { Button } from '@/shared';

export function TorrentManualForm({
  inputKind,
  magnet,
  pending,
  onInputKindChange,
  onMagnetChange,
  onFileChange,
  onSubmit,
}: {
  inputKind: 'magnet' | 'file';
  magnet: string;
  pending: boolean;
  onInputKindChange: (kind: 'magnet' | 'file') => void;
  onMagnetChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <details className="rounded-control border border-border p-3">
      <summary className="cursor-pointer font-semibold text-text-primary">Добавить вручную</summary>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <fieldset className="flex flex-wrap gap-4 text-sm text-text-primary">
          <legend className="mb-2 font-semibold">Источник торрента</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="torrent-input"
              checked={inputKind === 'magnet'}
              onChange={() => {
                onInputKindChange('magnet');
              }}
            />
            Magnet-ссылка
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="torrent-input"
              checked={inputKind === 'file'}
              onChange={() => {
                onInputKindChange('file');
              }}
            />
            Файл .torrent
          </label>
        </fieldset>
        {inputKind === 'magnet' ? (
          <label className="block space-y-2 text-sm font-semibold text-text-primary">
            <span>Magnet-ссылка</span>
            <textarea
              rows={3}
              value={magnet}
              onChange={(event) => {
                onMagnetChange(event.target.value);
              }}
              placeholder="magnet:?xt=urn:btih:…"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              className="w-full resize-y rounded-control border border-border bg-surface px-3 py-2 font-normal text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20"
            />
          </label>
        ) : (
          <label className="block space-y-2 text-sm font-semibold text-text-primary">
            <span>Файл .torrent (до 2 Мб)</span>
            <input
              type="file"
              accept=".torrent,application/x-bittorrent"
              onChange={(event) => {
                onFileChange(event.target.files?.[0] ?? null);
              }}
              className="block w-full text-sm font-normal"
            />
          </label>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Запускаем…' : 'Запустить'}
        </Button>
      </form>
    </details>
  );
}
