import type { MediaArtwork } from '@/entities/media';
import {
  getMediaSourcePlaybackIssue,
  type MediaSourceOption,
  type MediaSourcePlaybackIssue,
} from '@/entities/media-source';
import { ErrorState, IconButton, PlayIcon, Spinner } from '@/shared';

import { MediaVideoRenderer } from './MediaVideoRenderer';

export type MediaPlayerStatus = 'loading' | 'ready' | 'error';

export type MediaPlayerEmptyState = {
  title: string;
  description: string;
  visualCode: string;
  visualLabel: string;
};

export type MediaPlayerProps = {
  mediaTitle: string;
  backdrop?: MediaArtwork;
  source?: MediaSourceOption;
  isStarted: boolean;
  status: MediaPlayerStatus;
  onStart: () => void;
  onReady: () => void;
  onError: () => void;
  onRetry?: () => void;
  emptyState?: MediaPlayerEmptyState;
  embedded?: boolean;
};

type PlaybackIssueContent = {
  title: string;
  description: string;
  visualCode: string;
  visualLabel: string;
};

const playbackIssueContent: Record<MediaSourcePlaybackIssue, PlaybackIssueContent> = {
  expired: {
    title: 'Ссылка устарела',
    description: 'Мы попробуем подобрать новый вариант просмотра.',
    visualCode: '↻',
    visualLabel: 'Обновление',
  },
  'region-locked': {
    title: 'Просмотр недоступен в вашем регионе',
    description: 'Выберите другой вариант просмотра, если он доступен.',
    visualCode: '—',
    visualLabel: 'Ограничение доступа',
  },
  'account-required': {
    title: 'Требуется дополнительный доступ',
    description: 'Этот вариант нельзя открыть без дополнительного доступа. Выберите другой.',
    visualCode: 'i',
    visualLabel: 'Ограничение доступа',
  },
  'temporarily-unavailable': {
    title: 'Источник временно недоступен',
    description: 'Выберите другой вариант или вернитесь немного позже.',
    visualCode: '…',
    visualLabel: 'Временно недоступен',
  },
  'browser-unsupported': {
    title: 'Этот вариант нельзя открыть в браузере',
    description: 'Выберите другой доступный вариант просмотра.',
    visualCode: '×',
    visualLabel: 'Не поддерживается',
  },
};

function getSourceDescription(source: MediaSourceOption) {
  return [source.translation?.title, source.quality?.label].filter(Boolean).join(' · ');
}

const friendlyStateClassName = [
  'w-full max-w-xl rounded-card border border-white/15',
  'bg-black/40 px-3 py-3 shadow-overlay backdrop-blur-md min-[360px]:px-5 min-[360px]:py-5 sm:px-6',
].join(' ');

export function MediaPlayer({
  mediaTitle,
  backdrop,
  source,
  isStarted,
  status,
  onStart,
  onReady,
  onError,
  onRetry,
  emptyState,
  embedded = false,
}: MediaPlayerProps) {
  const sourceIssue = source ? getMediaSourcePlaybackIssue(source) : null;
  const sourceIssueContent = sourceIssue ? playbackIssueContent[sourceIssue] : null;

  const activeSource =
    source &&
    isStarted &&
    !sourceIssue &&
    (source.kind === 'embed' || source.kind === 'hls' || source.kind === 'mp4')
      ? source
      : undefined;
  const activeEmbedSource = activeSource?.kind === 'embed' ? activeSource : undefined;
  const activeVideoSource =
    activeSource?.kind === 'hls' || activeSource?.kind === 'mp4' ? activeSource : undefined;

  return (
    <section aria-label={`Плеер: ${mediaTitle}`}>
      <div
        className={[
          'relative isolate aspect-video overflow-hidden bg-black',
          embedded ? '' : 'rounded-card border border-border shadow-surface',
        ].join(' ')}
      >
        {!isStarted && backdrop && (
          <img
            src={backdrop.url}
            alt=""
            width={backdrop.width}
            height={backdrop.height}
            className="absolute inset-0 -z-20 size-full object-cover"
          />
        )}

        {!isStarted && <div className="absolute inset-0 -z-10 bg-black/55" />}

        {activeEmbedSource && status !== 'error' && (
          <iframe
            src={activeEmbedSource.url}
            title={`Плеер ${activeEmbedSource.label}: ${mediaTitle}`}
            className="absolute inset-0 z-0 size-full border-0"
            sandbox="allow-forms allow-presentation allow-same-origin allow-scripts"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            onLoad={onReady}
            onError={onError}
          />
        )}

        {activeVideoSource && status !== 'error' && (
          <MediaVideoRenderer
            source={activeVideoSource}
            mediaTitle={mediaTitle}
            onReady={onReady}
            onError={onError}
          />
        )}

        <div
          className={[
            'relative z-10 flex size-full items-center justify-center p-5 text-center sm:p-8',
            activeSource && status === 'ready' ? 'pointer-events-none' : '',
          ].join(' ')}
        >
          {!source && emptyState && (
            <ErrorState
              variant="player"
              title={emptyState.title}
              description={emptyState.description}
              visualCode={emptyState.visualCode}
              visualLabel={emptyState.visualLabel}
              className={friendlyStateClassName}
              tone="accent"
            />
          )}

          {source && sourceIssueContent && (
            <ErrorState
              variant="player"
              title={sourceIssueContent.title}
              description={sourceIssueContent.description}
              visualCode={sourceIssueContent.visualCode}
              visualLabel={sourceIssueContent.visualLabel}
              className={friendlyStateClassName}
              tone="accent"
            />
          )}

          {source && !isStarted && !sourceIssue && (
            <div className="flex flex-col items-center">
              <IconButton
                size="custom"
                variant="bare"
                aria-label={`Запустить ${source.label}`}
                className={[
                  'size-16 rounded-full border border-white/30 bg-black/45 text-white',
                  'backdrop-blur-sm hover:border-watermark/80 hover:bg-watermark/25',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-watermark/60',
                ].join(' ')}
                onClick={onStart}
              >
                <PlayIcon className="size-7" />
              </IconButton>

              <p className="mt-3 font-semibold text-white">{source.label}</p>
              <p className="mt-1 text-caption text-white/70">{getSourceDescription(source)}</p>
            </div>
          )}

          {source && isStarted && !sourceIssue && status === 'loading' && (
            <Spinner
              size="large"
              label={`Загрузка плеера ${source.label}`}
              className="[&>span:first-child]:text-white [&>span:first-child>span:last-child]:text-white/60"
            />
          )}

          {source && isStarted && !sourceIssue && status === 'ready' && !activeSource && (
            <div role="status">
              <p className="text-heading text-white">{source.label}</p>
              <p className="mt-2 text-caption text-white/60">
                Этот тип источника пока не подключён
              </p>
            </div>
          )}

          {source && isStarted && !sourceIssue && status === 'error' && (
            <ErrorState
              variant="player"
              title="Не удалось загрузить плеер"
              description="Проверьте подключение и попробуйте ещё раз."
              onRetry={onRetry}
              retryLabel="Повторить"
              visualLabel="Плеер недоступен"
            />
          )}
        </div>
      </div>
    </section>
  );
}
