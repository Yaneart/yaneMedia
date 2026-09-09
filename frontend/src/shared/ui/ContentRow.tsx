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
    'grid-flow-col auto-cols-[88%] overflow-x-auto snap-x snap-proximity scroll-px-1 sm:auto-cols-[68%] md:auto-cols-[52%] xl:auto-cols-[38%] 2xl:auto-cols-[31%] [&>*]:snap-start',
  collection:
    'grid-cols-2 gap-y-6 sm:grid-flow-col sm:grid-cols-none sm:auto-cols-[calc((100%_-_1rem)/2)] sm:gap-y-4 sm:overflow-x-auto sm:snap-x sm:snap-proximity sm:scroll-px-1 md:auto-cols-[calc((100%_-_2rem)/3)] xl:auto-cols-[calc((100%_-_4rem)/5)] 2xl:auto-cols-[calc((100%_-_5rem)/6)] sm:[&>*]:snap-start',
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
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
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

    setCanScrollBack(row.scrollLeft > SCROLL_EDGE_TOLERANCE_PX);
    setCanScrollForward(
      maximumScrollLeft > SCROLL_EDGE_TOLERANCE_PX &&
        row.scrollLeft < maximumScrollLeft - SCROLL_EDGE_TOLERANCE_PX,
    );
  }, []);

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    if (rowRef.current) {
      rowRef.current.style.scrollSnapType = '';
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

  useEffect(() => cancelScrollAnimation, [cancelScrollAnimation]);

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
    row.style.scrollSnapType = 'none';

    const animate = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / SCROLL_ANIMATION_DURATION_MS, 1);
      const easedProgress =
        progress < 0.5
          ? 4 * Math.pow(progress, 3)
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      row.scrollLeft =
        startScrollLeft + (targetScrollLeft - startScrollLeft) * easedProgress;

      if (progress < 1) {
        scrollAnimationFrameRef.current = window.requestAnimationFrame(animate);
        return;
      }

      scrollAnimationFrameRef.current = null;
      row.style.scrollSnapType = '';
      updateScrollState();
    };

    scrollAnimationFrameRef.current = window.requestAnimationFrame(animate);
  };

  const finishDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    const dragState = dragStateRef.current;

    if (dragState && row.hasPointerCapture(dragState.pointerId)) {
      row.releasePointerCapture(dragState.pointerId);
    }

    row.style.scrollSnapType = '';
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
      event.currentTarget.style.scrollSnapType = 'none';
      setIsDragging(true);
    }

    event.preventDefault();
    event.currentTarget.scrollLeft = dragState.startScrollLeft - distance;
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
          canScroll ? (isDragging ? 'sm:cursor-grabbing' : 'sm:cursor-grab') : '',
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
          className="absolute top-1/2 left-2 z-10 hidden size-11 -translate-y-1/2 rounded-full border border-white/15 bg-black/75 text-white shadow-lg backdrop-blur-sm hover:bg-black/90 sm:flex"
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
          className="absolute top-1/2 right-2 z-10 hidden size-11 -translate-y-1/2 rounded-full border border-white/15 bg-black/75 text-white shadow-lg backdrop-blur-sm hover:bg-black/90 sm:flex"
          onClick={() => scrollByPage(1)}
        >
          <RightIcon className="size-6" />
        </IconButton>
      )}
    </div>
  );
}
