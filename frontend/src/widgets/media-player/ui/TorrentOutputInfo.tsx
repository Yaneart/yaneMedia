import type { TorrentOutput } from '@/entities/torrent-session';

const videoReasons: Record<TorrentOutput['video']['reason'], string> = {
  compatible: 'совместимость с браузером',
  codec: 'видеокодек источника',
  pixel_format: 'глубина цвета или формат пикселей',
  profile: 'профиль видеокодека',
  resolution: 'доступное браузеру разрешение',
  frame_rate: 'ограничение частоты кадров до 30',
  level: 'уровень видеокодека',
  bitrate: 'высокий или неизвестный битрейт источника',
};

export function TorrentOutputInfo({ output }: { output: TorrentOutput }) {
  const { source, video, audio } = output;
  return (
    <details className="border-t border-border px-4 py-2 text-caption text-text-secondary">
      <summary className="cursor-pointer focus-visible:outline-watermark">
        Качество: {video.width}×{video.height} · {audio.channels === 1 ? 'моно' : 'стерео'}
      </summary>
      <div className="mt-2 space-y-1">
        <p>
          Источник: {source.codec.toUpperCase()} · {source.width}×{source.height} ·{' '}
          {source.bitDepth} бит · {Math.round(source.fps * 100) / 100} кадр/с · SDR.
        </p>
        <p>
          Видео: H.264 · {video.width}×{video.height} · 8 бит · {Math.round(video.fps * 100) / 100}{' '}
          кадр/с · SDR.{' '}
          {video.mode === 'copy'
            ? 'Без перекодирования и потери качества.'
            : `Преобразовано: ${videoReasons[video.reason]}.`}
        </p>
        <p>
          Звук: {audio.sourceCodec.toUpperCase()}
          {audio.sourceChannels !== null ? ` · ${audio.sourceChannels} кан.` : ''} → AAC ·{' '}
          {audio.channels} кан.{' '}
          {audio.mode === 'copy'
            ? 'Без перекодирования.'
            : audio.reason === 'surround'
              ? 'Многоканальный звук сведён в стерео.'
              : 'Преобразован для воспроизведения в браузере.'}
        </p>
      </div>
    </details>
  );
}
