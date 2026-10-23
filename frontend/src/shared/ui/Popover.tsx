import { IconButton, type IconButtonProps } from './IconButton';
import {
  useEffect,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type PopoverAlign = 'start' | 'center' | 'end';
export type PopoverSide = 'auto' | 'top' | 'bottom';

type PopoverChildren = ReactNode | ((closePopover: () => void) => ReactNode);

export type PopoverProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  trigger: ReactNode;
  triggerLabel: string;
  children: PopoverChildren;
  align?: PopoverAlign;
  side?: PopoverSide;
  triggerSize?: IconButtonProps['size'];
  triggerVariant?: IconButtonProps['variant'];
  triggerClassName?: string;
  panelClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  keepMounted?: boolean;
  stablePosition?: boolean;
  gap?: number;
  maxPanelHeight?: number;
};

export function Popover({
  trigger,
  triggerLabel,
  children,
  align = 'end',
  side = 'auto',
  triggerSize = 'medium',
  triggerVariant = 'ghost',
  triggerClassName = '',
  panelClassName = 'min-w-48 rounded-overlay bg-popover p-2',
  className = '',
  open,
  onOpenChange,
  keepMounted = false,
  stablePosition = false,
  gap = 8,
  maxPanelHeight,
  ...props
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setIsOpen = useCallback(
    (value: boolean) => {
      setInternalOpen(value);
      onOpenChange?.(value);
    },
    [onOpenChange],
  );
  const panelId = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    let host = containerRef.current?.parentElement;
    while (stablePosition && host && host !== document.body) {
      const style = getComputedStyle(host);
      if (/(auto|scroll)/.test(style.overflowY) && style.position !== 'static') {
        setPortalHost(host);
        return;
      }
      host = host.parentElement;
    }
    setPortalHost(document.body);
  }, [stablePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const container = containerRef.current;

      const target = event.target as Node;

      if (container && !container.contains(target) && !panelRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleFocusIn(event: FocusEvent) {
      const container = containerRef.current;

      const target = event.target as Node;

      if (container && !container.contains(target) && !panelRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setIsOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !portalHost) return;

    let anchor: {
      top: number;
      left: number;
      availableHeight: number;
      width: number;
      height: number;
    } | null = null;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;

      if (!trigger || !panel) return;

      const viewportPadding = 16;
      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;

      const alignedLeft =
        align === 'start'
          ? triggerRect.left
          : align === 'center'
            ? triggerRect.left + (triggerRect.width - panelRect.width) / 2
            : triggerRect.right - panelRect.width;
      const preferredLeft = Math.min(
        Math.max(alignedLeft, viewportPadding),
        Math.max(viewportPadding, viewportWidth - panelRect.width - viewportPadding),
      );

      const spaceBelow = viewportHeight - triggerRect.bottom - gap - viewportPadding;
      const spaceAbove = triggerRect.top - gap - viewportPadding;
      const openAbove =
        side === 'top' ||
        (side === 'auto' && panelRect.height > spaceBelow && spaceAbove > spaceBelow);
      const preferredTop = openAbove
        ? triggerRect.top - panelRect.height - gap
        : triggerRect.bottom + gap;
      const preferredClampedTop = Math.min(
        Math.max(preferredTop, viewportPadding),
        Math.max(viewportPadding, viewportHeight - panelRect.height - viewportPadding),
      );
      const keepAnchor =
        stablePosition &&
        anchor &&
        anchor.width === viewportWidth &&
        anchor.height === viewportHeight;
      const hostRect = portalHost.getBoundingClientRect();
      const originTop =
        portalHost === document.body
          ? -window.scrollY
          : hostRect.top + portalHost.clientTop - portalHost.scrollTop;
      const originLeft =
        portalHost === document.body
          ? -window.scrollX
          : hostRect.left + portalHost.clientLeft - portalHost.scrollLeft;
      const top =
        keepAnchor && anchor ? anchor.top : preferredClampedTop - (stablePosition ? originTop : 0);
      const left =
        keepAnchor && anchor ? anchor.left : preferredLeft - (stablePosition ? originLeft : 0);
      const availableHeight =
        keepAnchor && anchor
          ? anchor.availableHeight
          : viewportHeight - preferredClampedTop - viewportPadding;
      anchor = {
        top,
        left,
        availableHeight,
        width: viewportWidth,
        height: viewportHeight,
      };
      const maxHeight = stablePosition
        ? Math.min(maxPanelHeight ?? Infinity, availableHeight)
        : maxPanelHeight;

      setPanelStyle((current) =>
        current.left === left &&
        current.top === top &&
        current.maxHeight === maxHeight &&
        current.visibility === 'visible'
          ? current
          : { left, top, maxHeight, visibility: 'visible' },
      );
    };

    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    if (triggerRef.current) resizeObserver.observe(triggerRef.current);
    if (panelRef.current) resizeObserver.observe(panelRef.current);
    window.addEventListener('resize', updatePosition);
    if (!stablePosition) window.addEventListener('scroll', updatePosition, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, gap, isOpen, maxPanelHeight, portalHost, side, stablePosition]);

  const closePopover = () => setIsOpen(false);

  return (
    <div {...props} ref={containerRef} className={['relative inline-flex', className].join(' ')}>
      <IconButton
        ref={triggerRef}
        aria-label={triggerLabel}
        aria-controls={panelId}
        aria-expanded={isOpen}
        size={triggerSize}
        variant={triggerVariant}
        className={triggerClassName}
        onClick={() => setIsOpen(!isOpen)}
      >
        {trigger}
      </IconButton>

      {portalHost &&
        (isOpen || keepMounted) &&
        createPortal(
          <div
            ref={panelRef}
            hidden={!isOpen}
            id={panelId}
            style={{ ...panelStyle, maxHeight: panelStyle.maxHeight ?? maxPanelHeight }}
            className={[
              stablePosition ? 'absolute z-50' : 'fixed z-50',
              'border border-border text-text-primary shadow-overlay',
              panelClassName,
            ].join(' ')}
          >
            {typeof children === 'function' ? children(closePopover) : children}
          </div>,
          portalHost,
        )}
    </div>
  );
}
