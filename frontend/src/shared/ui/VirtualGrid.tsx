import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import {
  Children,
  isValidElement,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type KeyboardEvent,
} from 'react';

const focusable = 'a[href], button:not(:disabled), input:not(:disabled), [tabindex="0"]';
type Layout = {
  columns: number;
  width: number;
  columnGap: number;
  rowGap: number;
  paddingBottom: number;
  top: number;
};

export type VirtualGridProps = ComponentPropsWithRef<'div'> & { enabled?: boolean };

export function VirtualGrid({ children, enabled = true, ref, style, ...props }: VirtualGridProps) {
  'use no memo'; // The virtualizer exposes mutable measurements.
  const items = useMemo(() => Children.toArray(children), [children]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const layoutRef = useRef(layout);
  const [nearViewport, setNearViewport] = useState(true);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const pendingFocus = useRef<{ index: number; backwards: boolean } | null>(null);
  const resizeAnchor = useRef<{ index: number; offset: number } | null>(null);
  const columns = layout?.columns ?? 2;
  const count = Math.ceil(items.length / columns);
  const getItemKey = useCallback(
    (index: number) => {
      const item = items[index * columns];
      return `${columns}:${isValidElement(item) ? item.key : index}`;
    },
    [columns, items],
  );
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indices = defaultRangeExtractor(range);
      return focusedRow === null || focusedRow >= count || indices.includes(focusedRow)
        ? indices
        : [...indices, focusedRow].sort((a, b) => a - b);
    },
    [focusedRow, count],
  );
  const virtualizer = useVirtualizer({
    count,
    enabled: enabled && layout !== null,
    getScrollElement: () => scrollRef.current,
    estimateSize: () =>
      (((layout?.width ?? 0) - (columns - 1) * (layout?.columnGap ?? 16)) / columns) * 1.5 + 60,
    gap: layout?.rowGap ?? 24,
    scrollMargin: layout?.top ?? 0,
    overscan: 2,
    useFlushSync: false,
    getItemKey,
    rangeExtractor,
  });

  const setContainer = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const scroll = container?.closest('main');
    if (!enabled || !container || !scroll) return;
    scrollRef.current = scroll;
    const update = () => {
      const css = getComputedStyle(container);
      const next = css.gridAutoFlow.includes('column')
        ? null
        : {
            columns: css.gridTemplateColumns.split(' ').length,
            width: container.clientWidth,
            columnGap: parseFloat(css.columnGap) || 0,
            rowGap: parseFloat(css.rowGap) || 0,
            paddingBottom: parseFloat(css.paddingBottom) || 0,
            top:
              container.getBoundingClientRect().top -
              scroll.getBoundingClientRect().top +
              scroll.scrollTop -
              scroll.clientTop,
          };
      const previous = layoutRef.current;
      if (previous && next && previous.width !== next.width) {
        const row = virtualizer.getVirtualItems().find((item) => item.end > scroll.scrollTop);
        if (
          row &&
          scroll.scrollTop >= previous.top &&
          scroll.scrollTop < previous.top + virtualizer.getTotalSize()
        ) {
          resizeAnchor.current = {
            index: row.index * previous.columns,
            offset: scroll.scrollTop - row.start,
          };
        }
      }
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        layoutRef.current = next;
        setLayout(next);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(scroll);
    if (scroll.firstElementChild) observer.observe(scroll.firstElementChild);
    const visibility = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      {
        root: scroll,
        rootMargin: '600px',
      },
    );
    visibility.observe(container);
    return () => {
      observer.disconnect();
      visibility.disconnect();
    };
  }, [enabled, virtualizer]);

  useLayoutEffect(() => {
    virtualizer.measure();
    containerRef.current
      ?.querySelectorAll<HTMLElement>('[data-virtual-row]')
      .forEach(virtualizer.measureElement);
    const anchor = resizeAnchor.current;
    if (anchor && layoutRef.current && scrollRef.current) {
      resizeAnchor.current = null;
      virtualizer.scrollToIndex(Math.floor(anchor.index / columns), { align: 'start' });
      scrollRef.current.scrollTop += anchor.offset;
    }
  }, [columns, layout?.width, virtualizer]);

  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const row = containerRef.current?.querySelector(
      `[data-virtual-row="${Math.floor(pending.index / columns)}"]`,
    );
    const item = row?.children[pending.index % columns];
    const targets = item?.querySelectorAll<HTMLElement>(focusable);
    const target = pending.backwards ? targets?.[targets.length - 1] : targets?.[0];
    if (target) {
      pendingFocus.current = null;
      target.focus();
    }
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    props.onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Tab' || !layout) return;
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-virtual-row]');
    if (!row) return;
    const childIndex = [...row.children].findIndex((item) => item.contains(target));
    const targets = row.children[childIndex]?.querySelectorAll<HTMLElement>(focusable);
    if (!targets || target !== targets[event.shiftKey ? 0 : targets.length - 1]) return;
    const index = Number(row.dataset.virtualRow) * columns + childIndex + (event.shiftKey ? -1 : 1);
    if (
      index < 0 ||
      index >= items.length ||
      containerRef.current?.querySelector(`[data-virtual-row="${Math.floor(index / columns)}"]`)
    )
      return;
    event.preventDefault();
    pendingFocus.current = { index, backwards: event.shiftKey };
    setFocusedRow(Math.floor(index / columns));
    virtualizer.scrollToIndex(Math.floor(index / columns), { align: 'auto' });
  };

  const active = enabled && layout !== null;
  return (
    <div
      {...props}
      ref={setContainer}
      data-virtual-grid={active || undefined}
      data-virtual-count={active ? items.length : undefined}
      style={
        active
          ? {
              ...style,
              position: 'relative',
              height: virtualizer.getTotalSize() + layout.paddingBottom,
              overflowAnchor: 'none',
            }
          : style
      }
      onKeyDown={handleKeyDown}
      onFocusCapture={(event) => {
        props.onFocusCapture?.(event);
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-virtual-row]');
        if (row) setFocusedRow(Number(row.dataset.virtualRow));
      }}
      onBlurCapture={(event) => {
        props.onBlurCapture?.(event);
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedRow(null);
      }}
    >
      {active
        ? (nearViewport || focusedRow !== null ? virtualizer.getVirtualItems() : []).map((row) => (
            <div
              key={row.key}
              data-index={row.index}
              data-virtual-row={row.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                columnGap: layout.columnGap,
                transform: `translateY(${row.start - layout.top}px)`,
              }}
            >
              {items.slice(row.index * columns, (row.index + 1) * columns)}
            </div>
          ))
        : children}
    </div>
  );
}
