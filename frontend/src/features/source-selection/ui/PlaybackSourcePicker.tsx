import type { MediaSourceOption } from '@/entities/media-source';
import { Button, DownIcon, Popover } from '@/shared';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { getEmbedProviderSources, getPlaybackSourcePanel } from '../model/sourceSelection';

const labels = {
  source: '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
  chooseSource:
    '\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
  players: '\u041f\u043b\u0435\u0435\u0440\u044b',
  direct: '\u041f\u0440\u044f\u043c\u043e\u0435 \u0432\u0438\u0434\u0435\u043e',
  loading:
    '\u0418\u0449\u0435\u043c \u0435\u0449\u0451 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b',
};

type PlaybackSourcePickerProps = {
  embedSources: readonly MediaSourceOption[];
  directSources: readonly MediaSourceOption[];
  selectedSource?: MediaSourceOption;
  onEmbedSelect: (sourceRef: string) => void;
  onDirectSelect: (provider: string) => void;
  torrentOpen?: boolean;
  onTorrentOpenChange?: (open: boolean) => void;
  torrentPanel?: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  isLoading?: boolean;
};

const providerStyles: Record<string, string> = {
  'aderom-streaming': 'playback-source-slate',
  'initem-streaming': 'playback-source-cyan',
  'kinobd-streaming': 'playback-source-sand',
  'veoveo-streaming': 'playback-source-indigo',
  'veoveo-embed': 'playback-source-blue',
  'videohub-streaming': 'playback-source-teal',
  'aniliberty-streaming': 'playback-source-pink',
  'rutube-streaming': 'playback-source-coral',
  'collaps-streaming': 'playback-source-rose',
  'alloha-streaming': 'playback-source-emerald',
  'mirage-streaming': 'playback-source-violet',
  'kodik-streaming': 'playback-source-lime',
  'filmix-streaming': 'playback-source-orange',
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

  return `${surface} ${selected && !providerStyle ? 'ring-1 ring-inset ring-white/30' : ''}`;
}

export function PlaybackSourcePicker({
  embedSources,
  directSources,
  selectedSource,
  onEmbedSelect,
  onDirectSelect,
  torrentOpen = false,
  onTorrentOpenChange,
  torrentPanel,
  align = 'start',
  isLoading = false,
}: PlaybackSourcePickerProps) {
  const selectedLabel = selectedSource?.label ?? null;
  const embedProviders = getEmbedProviderSources(embedSources);
  const providers = Array.from(
    new Map(directSources.map((source) => [source.provider, source])).entries(),
  );
  const directSelected =
    selectedSource?.provider !== 'torrent' &&
    (selectedSource?.kind === 'hls' || selectedSource?.kind === 'mp4');
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
    if (!popoverOpen) setActivePanel(selectedPanel);
  }, [popoverOpen, selectedPanel]);

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
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-caption text-text-secondary">{labels.source}</span>
          <span className="truncate font-medium text-text-primary">
            {selectedLabel ?? labels.chooseSource}
          </span>
          <DownIcon aria-hidden="true" className="ml-auto size-4 shrink-0 text-text-secondary" />
        </span>
      }
      triggerLabel={selectedLabel ?? labels.source}
      triggerVariant="secondary"
      triggerSize="custom"
      triggerClassName="min-h-10 w-full justify-between rounded-control border border-border bg-control px-3"
      className="w-full min-w-0"
      align={align}
      panelClassName={`playback-source-popover ${torrentPanel ? 'w-[min(36rem,calc(100vw-2rem))]' : 'w-[min(23rem,calc(100vw-2rem))]'} overflow-y-auto overscroll-contain rounded-overlay px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
    >
      {(close) => (
        <div ref={contentRef}>
          {(torrentPanel || (embedSources.length > 0 && providers.length > 0)) && (
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
                      tabs[next]?.focus({ preventScroll: true });
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

          {isLoading && visiblePanel !== 'torrent' && (
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
              {embedProviders.map((source) => (
                <Button
                  key={source.provider}
                  size="custom"
                  variant="bare"
                  className={`min-h-12 min-w-0 w-full justify-start rounded-control border px-3 text-left text-sm text-text-primary ${getSourceButtonStyle(source.provider, selectedSource?.kind === 'embed' && selectedSource.provider === source.provider)}`}
                  aria-pressed={
                    selectedSource?.kind === 'embed' && selectedSource.provider === source.provider
                  }
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
            <section aria-label={labels.direct} className="grid grid-cols-2 items-start gap-2">
              {providers.length === 0 && (
                <p className="col-span-2 p-3 text-sm text-text-secondary">
                  Прямые источники пока не найдены.
                </p>
              )}
              {providers.map(([provider, source]) => (
                <Button
                  key={provider}
                  size="custom"
                  variant="bare"
                  className={`min-h-12 w-full justify-start rounded-control border px-3 py-2 text-left text-sm text-text-primary ${getSourceButtonStyle(provider, directSelected && selectedSource?.provider === provider)}`}
                  aria-pressed={directSelected && selectedSource?.provider === provider}
                  onClick={() => {
                    onDirectSelect(provider);
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
          ) : null}
        </div>
      )}
    </Popover>
  );
}
