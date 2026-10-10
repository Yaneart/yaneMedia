import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUIEvent,
} from 'react';

import { IconButton } from './IconButton';
import { LeftIcon, RightIcon } from './Icons';

export type ContentRowVariant = 'continuation' | 'collection';

export type ContentRowProps = ComponentPropsWithRef<'div'> & {
  variant?: ContentRowVariant;
};

const variantClasses: Record<ContentRowVariant, string> = {
  continuation:
    'grid-flow-col auto-cols-[88%] overflow-x-auto sm:auto-cols-[68%] md:auto-cols-[52%] xl:auto-cols-[38%] 2xl:auto-cols-[31%]',
  collection:
    'grid-cols-2 gap-y-6 sm:grid-flow-col sm:grid-cols-none sm:auto-cols-[calc((100%_-_1rem)/2)] sm:gap-y-4 sm:overflow-x-auto md:auto-cols-[calc((100%_-_2rem)/3)] xl:auto-cols-[calc((100%_-_4rem)/5)] 2xl:auto-cols-[calc((100%_-_5rem)/6)]',
};

const DRAG_THRESHOLD_PX = 6;
const SCROLL_EDGE_TOLERANCE_PX = 2;
const SCROLL_ANIMATION_DURATION_MS = 520;

type DragState = {
  pointerId: number;
  startScrollLeft: number;
  startX: number;
};

export function ContentRow({
  variant = 'collection',
  className = '',
  children,
  ref,
  onClickCapture,
  onDragStartCapture,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onScroll,
  ...props
}: ContentRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dragAnimationFrameRef = useRef<number | null>(null);
  const pendingDragScrollLeftRef = useRef<number | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const canScrollBackRef = useRef(false);
  const canScrollForwardRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);
  const canScroll = canScrollBack || canScrollForward;

  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;

      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  const updateScrollState = useCallback(() => {
    const row = rowRef.current;

    if (!row) {
      return;
    }

    const maximumScrollLeft = row.scrollWidth - row.clientWidth;

    const nextCanScrollBack = row.scrollLeft > SCROLL_EDGE_TOLERANCE_PX;
    const nextCanScrollForward =
      maximumScrollLeft > SCROLL_EDGE_TOLERANCE_PX &&
      row.scrollLeft < maximumScrollLeft - SCROLL_EDGE_TOLERANCE_PX;

    if (nextCanScrollBack !== canScrollBackRef.current) {
      canScrollBackRef.current = nextCanScrollBack;
      setCanScrollBack(nextCanScrollBack);
    }

    if (nextCanScrollForward !== canScrollForwardRef.current) {
      canScrollForwardRef.current = nextCanScrollForward;
      setCanScrollForward(nextCanScrollForward);
    }
  }, []);

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    updateScrollState();

    const row = rowRef.current;

    if (!row || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(row);

    return () => observer.disconnect();
  }, [children, updateScrollState]);

  useEffect(
    () => () => {
      cancelScrollAnimation();

      if (dragAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAnimationFrameRef.current);
      }
    },
    [cancelScrollAnimation],
  );

  const scrollByPage = (direction: -1 | 1) => {
    const row = rowRef.current;

    if (!row) {
      return;
    }

    cancelScrollAnimation();

    const startScrollLeft = row.scrollLeft;
    const maximumScrollLeft = row.scrollWidth - row.clientWidth;
    const targetScrollLeft = Math.min(
      maximumScrollLeft,
      Math.max(0, startScrollLeft + direction * row.clientWidth * 0.9),
    );

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      row.scrollLeft = targetScrollLeft;
      updateScrollState();
      return;
    }

    const startedAt = performance.now();
    const animate = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / SCROLL_ANIMATION_DURATION_MS, 1);
      const easedProgress =
        progress < 0.5 ? 4 * Math.pow(progress, 3) : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      row.scrollLeft = startScrollLeft + (targetScrollLeft - startScrollLeft) * easedProgress;

      if (progress < 1) {
        scrollAnimationFrameRef.current = window.requestAnimationFrame(animate);
        return;
      }

      scrollAnimationFrameRef.current = null;
      updateScrollState();
    };

    scrollAnimationFrameRef.current = window.requestAnimationFrame(animate);
  };

  const finishDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    const dragState = dragStateRef.current;

    if (dragAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAnimationFrameRef.current);
      dragAnimationFrameRef.current = null;
    }

    if (pendingDragScrollLeftRef.current !== null) {
      row.scrollLeft = pendingDragScrollLeftRef.current;
      pendingDragScrollLeftRef.current = null;
    }

    if (dragState && row.hasPointerCapture(dragState.pointerId)) {
      row.releasePointerCapture(dragState.pointerId);
    }

    dragStateRef.current = null;
    setIsDragging(false);
    updateScrollState();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);

    if (
      event.defaultPrevented ||
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      event.currentTarget.scrollWidth <= event.currentTarget.clientWidth
    ) {
      return;
    }

    cancelScrollAnimation();
    pendingDragScrollLeftRef.current = null;
    suppressClickRef.current = false;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startScrollLeft: event.currentTarget.scrollLeft,
      startX: event.clientX,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);

    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const distance = event.clientX - dragState.startX;

    if (!suppressClickRef.current && Math.abs(distance) < DRAG_THRESHOLD_PX) {
      return;
    }

    if (!suppressClickRef.current) {
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }

    event.preventDefault();
    pendingDragScrollLeftRef.current = dragState.startScrollLeft - distance;

    if (dragAnimationFrameRef.current === null) {
      dragAnimationFrameRef.current = window.requestAnimationFrame(() => {
        dragAnimationFrameRef.current = null;

        if (rowRef.current && pendingDragScrollLeftRef.current !== null) {
          rowRef.current.scrollLeft = pendingDragScrollLeftRef.current;
          pendingDragScrollLeftRef.current = null;
        }
      });
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerUp?.(event);
    finishDragging(event);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerCancel?.(event);
    suppressClickRef.current = false;
    finishDragging(event);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
    }

    onClickCapture?.(event);
  };

  const handleDragStartCapture = (event: ReactDragEvent<HTMLDivElement>) => {
    onDragStartCapture?.(event);

    if (dragStateRef.current) {
      event.preventDefault();
    }
  };

  const handleScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    updateScrollState();
    onScroll?.(event);
  };

  return (
    <div className="relative min-w-0">
      <div
        {...props}
        ref={setRowRef}
        className={[
          'yane-content-scrollbar grid gap-4 pb-2 sm:select-none',
          canScroll
            ? isDragging
              ? 'sm:cursor-grabbing [&>*]:pointer-events-none'
              : 'sm:cursor-grab'
            : '',
          variantClasses[variant],
          className,
        ].join(' ')}
        onClickCapture={handleClickCapture}
        onDragStartCapture={handleDragStartCapture}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onScroll={handleScroll}
      >
        {children}
      </div>

      {canScrollBack && (
        <IconButton
          variant="bare"
          size="custom"
          aria-label="Прокрутить подборку назад"
          className="yane-content-row-arrow absolute top-1/2 left-2 z-10 size-11 -translate-y-1/2 rounded-full border border-white/15 bg-black/90 text-white shadow-lg hover:bg-black"
          onClick={() => scrollByPage(-1)}
        >
          <LeftIcon className="size-6" />
        </IconButton>
      )}

      {canScrollForward && (
        <IconButton
          variant="bare"
          size="custom"
          aria-label="Прокрутить подборку вперёд"
          className="yane-content-row-arrow absolute top-1/2 right-2 z-10 size-11 -translate-y-1/2 rounded-full border border-white/15 bg-black/90 text-white shadow-lg hover:bg-black"
          onClick={() => scrollByPage(1)}
        >
          <RightIcon className="size-6" />
        </IconButton>
      )}
    </div>
  );
}
