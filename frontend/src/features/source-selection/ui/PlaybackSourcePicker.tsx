import type { MediaSourceOption } from '@/entities/media-source';
import { Button, DownIcon, Popover } from '@/shared';
import { useEffect, useState } from 'react';

import { getDirectTrackKey, getPlaybackSourcePanel } from '../model/sourceSelection';

const labels = {
  source: '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
  chooseSource:
    '\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
  players: '\u041f\u043b\u0435\u0435\u0440\u044b',
  selected: '\u0412\u044b\u0431\u0440\u0430\u043d\u043e',
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
  align?: 'start' | 'end';
  isLoading?: boolean;
};

const providerStyles: Record<string, { accent: string; surface: string }> = {
  'aderom-streaming': {
    accent: 'bg-blue-300',
    surface: 'border-blue-300/20 bg-blue-400/10 hover:bg-blue-400/15',
  },
  'initem-streaming': {
    accent: 'bg-cyan-300',
    surface: 'border-cyan-300/20 bg-cyan-400/10 hover:bg-cyan-400/15',
  },
  'ddbb-streaming': {
    accent: 'bg-rose-300',
    surface: 'border-rose-300/20 bg-rose-400/10 hover:bg-rose-400/15',
  },
  'kinobd-streaming': {
    accent: 'bg-sky-300',
    surface: 'border-sky-300/20 bg-sky-400/10 hover:bg-sky-400/15',
  },
  'veoveo-streaming': {
    accent: 'bg-violet-300',
    surface: 'border-violet-300/20 bg-violet-400/10 hover:bg-violet-400/15',
  },
  'videohub-streaming': {
    accent: 'bg-emerald-300',
    surface: 'border-emerald-300/20 bg-emerald-400/10 hover:bg-emerald-400/15',
  },
  'aniliberty-streaming': {
    accent: 'bg-pink-300',
    surface: 'border-pink-300/20 bg-pink-400/10 hover:bg-pink-400/15',
  },
};

function getProviderAccent(provider: string) {
  return providerStyles[provider]?.accent ?? 'bg-text-secondary';
}

function getSourceButtonStyle(provider: string, selected: boolean) {
  const surface =
    providerStyles[provider]?.surface ??
    'border-border bg-control hover:border-text-secondary/40 hover:bg-control-hover';

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
  align = 'start',
  isLoading = false,
}: PlaybackSourcePickerProps) {
  const selectedLabel = selectedSource?.label ?? null;
  const tracks = Array.from(
    new Map(directSources.map((source) => [getDirectTrackKey(source), source])).entries(),
  );
  const showBothPanels = embedSources.length > 0 && tracks.length > 0;
  const [activePanel, setActivePanel] = useState<'players' | 'direct'>(() =>
    getPlaybackSourcePanel(selectedSource),
  );
  const visiblePanel = showBothPanels ? activePanel : tracks.length > 0 ? 'direct' : 'players';

  useEffect(() => {
    setActivePanel(getPlaybackSourcePanel(selectedSource));
  }, [selectedSource]);

  return (
    <Popover
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
      panelClassName="max-h-[calc(100dvh-2rem)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto rounded-overlay bg-popover p-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {(close) => (
        <div>
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

          {showBothPanels && (
            <div
              role="tablist"
              aria-label={labels.source}
              className="mb-2 grid grid-cols-2 rounded-control bg-control p-1"
            >
              {(['players', 'direct'] as const).map((panel) => (
                <Button
                  key={panel}
                  role="tab"
                  aria-selected={activePanel === panel}
                  size="small"
                  variant={activePanel === panel ? 'secondary' : 'bare'}
                  className="min-h-8 border-0 px-2 text-xs"
                  onClick={() => setActivePanel(panel)}
                >
                  {panel === 'players' ? labels.players : labels.direct}
                </Button>
              ))}
            </div>
          )}

          {visiblePanel === 'players' ? (
            <section aria-label={labels.players} className="space-y-1">
              {embedSources.map((source) => (
                <Button
                  key={source.sourceRef}
                  size="custom"
                  variant="bare"
                  className={`min-h-9 w-full justify-start rounded-control border px-2.5 text-left text-sm text-text-primary ${getSourceButtonStyle(source.provider, selectedSource?.sourceRef === source.sourceRef)}`}
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
                  {selectedSource?.sourceRef === source.sourceRef && (
                    <span className="text-xs text-text-secondary">{labels.selected}</span>
                  )}
                </Button>
              ))}
            </section>
          ) : (
            <section aria-label={labels.directVideo} className="space-y-1">
              {tracks.map(([trackKey, source]) => {
                const qualities = directSources.filter(
                  (qualitySource) => getDirectTrackKey(qualitySource) === trackKey,
                );

                return (
                  <div key={trackKey}>
                    <Button
                      size="custom"
                      variant="bare"
                      className={`min-h-9 w-full justify-start rounded-control border px-2.5 text-left text-sm text-text-primary ${getSourceButtonStyle(source.provider, selectedTrackKey === trackKey)}`}
                      aria-pressed={selectedTrackKey === trackKey}
                      onClick={() => onDirectSelect(trackKey)}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${getProviderAccent(source.provider)}`}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {source.label}{' '}
                        <span className="text-text-secondary">
                          · {source.translation?.title ?? labels.original}
                        </span>
                      </span>
                    </Button>
                    {selectedTrackKey === trackKey && qualities.length > 1 && (
                      <div className="flex flex-wrap gap-1 px-2 pb-1 pt-1.5">
                        {qualities.map((qualitySource) => (
                          <Button
                            key={qualitySource.sourceRef}
                            size="small"
                            variant={
                              selectedDirectSource?.sourceRef === qualitySource.sourceRef
                                ? 'primary'
                                : 'secondary'
                            }
                            aria-pressed={
                              selectedDirectSource?.sourceRef === qualitySource.sourceRef
                            }
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
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}
    </Popover>
  );
}
