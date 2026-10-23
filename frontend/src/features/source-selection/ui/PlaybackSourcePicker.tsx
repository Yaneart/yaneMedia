import type { MediaSourceOption } from '@/entities/media-source';
import { Button, DownIcon, Popover } from '@/shared';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { getDirectTrackKey, getPlaybackSourcePanel } from '../model/sourceSelection';

const labels = {
  source: '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
  chooseSource:
    '\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
  players: '\u041f\u043b\u0435\u0435\u0440\u044b',
  directVideo:
    '\u041f\u0440\u044f\u043c\u043e\u0435 \u0432\u0438\u0434\u0435\u043e \u00b7 \u043e\u0437\u0432\u0443\u0447\u043a\u0430',
  original: '\u041e\u0440\u0438\u0433\u0438\u043d\u0430\u043b',
  auto: '\u0410\u0432\u0442\u043e',
  direct: '\u041f\u0440\u044f\u043c\u043e\u0435 \u0432\u0438\u0434\u0435\u043e',
  loading:
    '\u0418\u0449\u0435\u043c \u0435\u0449\u0451 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b',
};

type PlaybackSourcePickerProps = {
  embedSources: readonly MediaSourceOption[];
  directSources: readonly MediaSourceOption[];
  selectedSource?: MediaSourceOption;
  selectedDirectSource?: MediaSourceOption;
  selectedTrackKey: string | null;
  onEmbedSelect: (sourceRef: string) => void;
  onDirectSelect: (trackKey: string) => void;
  onQualitySelect: (sourceRef: string) => void;
  torrentOpen?: boolean;
  onTorrentOpenChange?: (open: boolean) => void;
  torrentPanel?: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  isLoading?: boolean;
};

const providerStyles: Record<string, string> = {
  'aderom-streaming': 'playback-source-blue',
  'initem-streaming': 'playback-source-cyan',
  'ddbb-streaming': 'playback-source-rose',
  'kinobd-streaming': 'playback-source-sky',
  'veoveo-streaming': 'playback-source-violet',
  'videohub-streaming': 'playback-source-emerald',
  'aniliberty-streaming': 'playback-source-pink',
  'rutube-streaming': 'playback-source-blue',
};

function getProviderAccent(provider: string) {
  const providerStyle = providerStyles[provider];

  return providerStyle ? `playback-source-accent ${providerStyle}` : 'bg-text-secondary';
}

function getSourceButtonStyle(provider: string, selected: boolean) {
  const providerStyle = providerStyles[provider];
  const surface = providerStyle
    ? `playback-source-surface ${providerStyle}`
    : 'border-border bg-control hover:border-text-secondary/40 hover:bg-control-hover';

  return `${surface} ${selected ? 'ring-1 ring-inset ring-white/30' : ''}`;
}

export function PlaybackSourcePicker({
  embedSources,
  directSources,
  selectedSource,
  selectedDirectSource,
  selectedTrackKey,
  onEmbedSelect,
  onDirectSelect,
  onQualitySelect,
  torrentOpen = false,
  onTorrentOpenChange,
  torrentPanel,
  align = 'start',
  isLoading = false,
}: PlaybackSourcePickerProps) {
  const selectedLabel = selectedSource?.label ?? null;
  const tracks = Array.from(
    new Map(directSources.map((source) => [getDirectTrackKey(source), source])).entries(),
  );
  const directSelected =
    selectedSource?.provider !== 'torrent' &&
    (selectedSource?.kind === 'hls' || selectedSource?.kind === 'mp4');
  const selectedQualities = directSources.filter(
    (source) => getDirectTrackKey(source) === selectedTrackKey,
  );
  const [popoverOpen, setPopoverOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [activePanel, setActivePanel] = useState<'players' | 'direct' | 'torrent'>(() =>
    getPlaybackSourcePanel(selectedSource),
  );
  const visiblePanel = activePanel;
  const selectedPanel =
    selectedSource?.provider === 'torrent' ? 'torrent' : getPlaybackSourcePanel(selectedSource);

  useLayoutEffect(() => {
    if (!popoverOpen) return;
    const panel = contentRef.current?.closest<HTMLElement>('.playback-source-popover');
    if (panel) panel.scrollTop = 0;
  }, [popoverOpen, activePanel]);

  useEffect(() => {
    setActivePanel(selectedPanel);
  }, [selectedSource?.sourceRef, selectedPanel]);

  useEffect(() => {
    if (!torrentOpen) return;
    setActivePanel('torrent');
    setPopoverOpen(true);
  }, [torrentOpen]);

  return (
    <Popover
      open={popoverOpen}
      stablePosition
      gap={12}
      maxPanelHeight={560}
      keepMounted={!!torrentPanel}
      onOpenChange={(open) => {
        setPopoverOpen(open);
        onTorrentOpenChange?.(open && activePanel === 'torrent');
      }}
      trigger={
        <span className="flex max-w-52 items-center gap-2 truncate">
          <span className="text-caption text-text-secondary">{labels.source}</span>
          <span className="truncate font-medium text-text-primary">
            {selectedLabel ?? labels.chooseSource}
          </span>
          <DownIcon aria-hidden="true" className="size-4 shrink-0 text-text-secondary" />
        </span>
      }
      triggerLabel={selectedLabel ?? labels.source}
      triggerVariant="secondary"
      triggerSize="custom"
      triggerClassName="min-h-10 w-full justify-between rounded-control border border-border bg-control px-3 2xl:w-auto 2xl:min-w-44"
      className="w-full min-w-0 2xl:w-auto"
      align={align}
      panelClassName={`playback-source-popover ${torrentPanel ? 'w-[min(36rem,calc(100vw-2rem))]' : 'w-[min(23rem,calc(100vw-2rem))]'} overflow-y-auto overscroll-contain rounded-overlay px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
    >
      {(close) => (
        <div ref={contentRef}>
          {(torrentPanel || (embedSources.length > 0 && tracks.length > 0)) && (
            <div className="playback-source-header sticky top-0 z-20 -mx-3 mb-3 px-3 pb-3">
              <div
                role="tablist"
                aria-label={labels.source}
                className="playback-source-tabs flex gap-1 rounded-control p-1"
              >
                {(
                  ['players', 'direct', ...(torrentPanel ? ['torrent' as const] : [])] as const
                ).map((panel) => (
                  <Button
                    key={panel}
                    role="tab"
                    aria-selected={activePanel === panel}
                    size="small"
                    variant="bare"
                    className="playback-source-tab min-h-9 min-w-0 flex-1 border px-2 text-xs"
                    onClick={() => {
                      setActivePanel(panel);
                      onTorrentOpenChange?.(panel === 'torrent');
                    }}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                      event.preventDefault();
                      const tabs = Array.from(
                        event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                          '[role="tab"]',
                        ),
                      );
                      const index = tabs.indexOf(event.currentTarget);
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? tabs.length - 1
                            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
                              tabs.length;
                      tabs[next]?.focus();
                      tabs[next]?.click();
                    }}
                  >
                    {panel === 'players'
                      ? labels.players
                      : panel === 'direct'
                        ? labels.direct
                        : 'Торренты'}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {isLoading && (
            <div
              role="status"
              aria-live="polite"
              className="mb-2 flex items-center gap-2 px-1 py-0.5 text-xs text-text-secondary"
            >
              <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-border border-t-action motion-reduce:animate-none" />
              <span>{labels.loading}</span>
            </div>
          )}

          <div hidden={visiblePanel !== 'torrent'}>
            {torrentPanel?.(() => {
              close();
              onTorrentOpenChange?.(false);
            })}
          </div>
          {visiblePanel === 'players' ? (
            <section aria-label={labels.players} className="grid grid-cols-2 gap-2">
              {embedSources.length === 0 && (
                <p className="col-span-2 p-3 text-sm text-text-secondary">
                  Плееры пока не найдены.
                </p>
              )}
              {embedSources.map((source) => (
                <Button
                  key={source.sourceRef}
                  size="custom"
                  variant="bare"
                  className={`min-h-12 min-w-0 w-full justify-start rounded-control border px-3 text-left text-sm text-text-primary ${getSourceButtonStyle(source.provider, selectedSource?.sourceRef === source.sourceRef)}`}
                  aria-pressed={selectedSource?.sourceRef === source.sourceRef}
                  onClick={() => {
                    onEmbedSelect(source.sourceRef);
                    close();
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${getProviderAccent(source.provider)}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{source.label}</span>
                </Button>
              ))}
            </section>
          ) : visiblePanel === 'direct' ? (
            <section aria-label={labels.directVideo} className="grid grid-cols-2 items-start gap-2">
              {tracks.length === 0 && (
                <p className="col-span-2 p-3 text-sm text-text-secondary">
                  Прямые источники пока не найдены.
                </p>
              )}
              {tracks.map(([trackKey, source]) => (
                <Button
                  key={trackKey}
                  size="custom"
                  variant="bare"
                  className={`min-h-16 w-full justify-start rounded-control border px-3 py-2 text-left text-sm text-text-primary ${getSourceButtonStyle(source.provider, directSelected && selectedTrackKey === trackKey)}`}
                  aria-pressed={directSelected && selectedTrackKey === trackKey}
                  onClick={() => onDirectSelect(trackKey)}
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${getProviderAccent(source.provider)}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{source.label}</span>
                    <span
                      className="block truncate text-xs font-medium text-text-secondary"
                      title={source.translation?.title ?? labels.original}
                    >
                      {source.translation?.title ?? labels.original}
                    </span>
                  </span>
                </Button>
              ))}
              {directSelected && selectedQualities.length > 1 && (
                <div className="col-span-2 mt-1 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                  <span className="mr-1 text-xs text-text-secondary">Качество</span>
                  {selectedQualities.map((qualitySource) => (
                    <Button
                      key={qualitySource.sourceRef}
                      size="small"
                      variant={
                        selectedDirectSource?.sourceRef === qualitySource.sourceRef
                          ? 'primary'
                          : 'secondary'
                      }
                      aria-pressed={selectedDirectSource?.sourceRef === qualitySource.sourceRef}
                      onClick={() => {
                        onQualitySelect(qualitySource.sourceRef);
                        close();
                      }}
                    >
                      {qualitySource.quality?.label ?? labels.auto}
                    </Button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      )}
    </Popover>
  );
}
