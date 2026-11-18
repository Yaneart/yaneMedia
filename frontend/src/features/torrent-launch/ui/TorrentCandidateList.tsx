import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { TorrentCandidate } from '@/entities/torrent-session';
import { CandidateCard } from './CandidateCard';

type Props = {
  candidates: readonly TorrentCandidate[];
  pending: boolean;
  selectedCandidateRef?: string | null;
  status?: string;
  onSelect: (candidate: TorrentCandidate) => void;
};

export function TorrentCandidateList(props: Props) {
  if (props.candidates.length > 12) return <VirtualCandidateList {...props} />;
  return (
    <div role="list" aria-label="Раздачи" className="space-y-2">
      {props.candidates.map((candidate) => (
        <div role="listitem" key={candidate.candidateRef}>
          {card(candidate, props)}
        </div>
      ))}
    </div>
  );
}

function card(candidate: TorrentCandidate, props: Props) {
  return (
    <CandidateCard
      candidate={candidate}
      pending={props.pending}
      selected={props.selectedCandidateRef === candidate.candidateRef}
      status={props.selectedCandidateRef === candidate.candidateRef ? props.status : undefined}
      onSelect={() => props.onSelect(candidate)}
    />
  );
}

function VirtualCandidateList(props: Props) {
  'use no memo';
  const { candidates } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({
    scroll: null as HTMLElement | null,
    margin: 0,
    width: 0,
    header: 0,
  });
  const pendingFocus = useRef<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const getItemKey = useCallback((index: number) => candidates[index].candidateRef, [candidates]);
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indices = defaultRangeExtractor(range);
      return focusedIndex === null || indices.includes(focusedIndex)
        ? indices
        : [...indices, focusedIndex].sort((a, b) => a - b);
    },
    [focusedIndex],
  );
  const virtualizer = useVirtualizer({
    count: candidates.length,
    enabled: viewport.scroll !== null,
    getScrollElement: () => viewport.scroll,
    scrollMargin: viewport.margin,
    scrollPaddingStart: viewport.header,
    estimateSize: () => 160,
    initialRect: { width: 0, height: 576 },
    gap: 8,
    overscan: 3,
    useFlushSync: false,
    getItemKey,
    rangeExtractor,
  });
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let scroll = list.parentElement;
    while (scroll && !/^(auto|scroll)$/.test(getComputedStyle(scroll).overflowY))
      scroll = scroll.parentElement;
    if (!scroll) return;
    const owner = scroll;
    owner.scrollTop = 0;
    const update = () => {
      if (!owner.clientHeight || !list.getClientRects().length) return;
      const margin =
        list.getBoundingClientRect().top -
        owner.getBoundingClientRect().top +
        owner.scrollTop -
        owner.clientTop;
      const width = list.clientWidth;
      const header = owner.querySelector('[role="tablist"]')?.parentElement?.offsetHeight ?? 0;
      setViewport((previous) =>
        previous.scroll === owner &&
        previous.margin === margin &&
        previous.width === width &&
        previous.header === header
          ? previous
          : { scroll: owner, margin, width, header },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(owner);
    observer.observe(list);
    if (owner.firstElementChild) observer.observe(owner.firstElementChild);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    virtualizer.measure();
    listRef.current
      ?.querySelectorAll<HTMLElement>('[data-index]')
      .forEach(virtualizer.measureElement);
  }, [viewport.width, virtualizer]);
  useLayoutEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    const button = listRef.current?.querySelector<HTMLButtonElement>(
      `[data-index="${index}"] button`,
    );
    if (button) {
      pendingFocus.current = null;
      button.focus({ preventScroll: true });
    }
  });
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (!row) return;
    const next = Number(row.dataset.index) + (event.shiftKey ? -1 : 1);
    if (
      next < 0 ||
      next >= candidates.length ||
      listRef.current?.querySelector(`[data-index="${next}"]`)
    )
      return;
    event.preventDefault();
    pendingFocus.current = next;
    setFocusedIndex(next);
    virtualizer.scrollToIndex(next, { align: 'auto' });
  };
  return (
    <div
      role="list"
      aria-label="Раздачи"
      ref={listRef}
      data-virtual-candidates={candidates.length}
      style={{ overflowAnchor: 'none' }}
      onKeyDown={handleKeyDown}
      onFocusCapture={(event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
        if (row) setFocusedIndex(Number(row.dataset.index));
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocusedIndex(null);
      }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            role="listitem"
            aria-posinset={row.index + 1}
            aria-setsize={candidates.length}
            data-index={row.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start - viewport.margin}px)`,
            }}
          >
            {card(candidates[row.index], props)}
          </div>
        ))}
      </div>
    </div>
  );
}
