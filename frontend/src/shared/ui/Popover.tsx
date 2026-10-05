import { IconButton, type IconButtonProps } from './IconButton';
import {
  useEffect,
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

type PopoverChildren = ReactNode | ((closePopover: () => void) => ReactNode);

export type PopoverProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  trigger: ReactNode;
  triggerLabel: string;
  children: PopoverChildren;
  align?: PopoverAlign;
  triggerSize?: IconButtonProps['size'];
  triggerVariant?: IconButtonProps['variant'];
  triggerClassName?: string;
  panelClassName?: string;
};

export function Popover({
  trigger,
  triggerLabel,
  children,
  align = 'end',
  triggerSize = 'medium',
  triggerVariant = 'ghost',
  triggerClassName = '',
  panelClassName = 'min-w-48 rounded-overlay bg-popover p-2',
  className = '',
  ...props
}: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ visibility: 'hidden' });

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
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;

      if (!trigger || !panel) return;

      const viewportPadding = 16;
      const gap = 8;
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
      const left = Math.min(
        Math.max(alignedLeft, viewportPadding),
        Math.max(viewportPadding, viewportWidth - panelRect.width - viewportPadding),
      );

      const spaceBelow = viewportHeight - triggerRect.bottom - gap - viewportPadding;
      const spaceAbove = triggerRect.top - gap - viewportPadding;
      const openAbove = panelRect.height > spaceBelow && spaceAbove > spaceBelow;
      const preferredTop = openAbove
        ? triggerRect.top - panelRect.height - gap
        : triggerRect.bottom + gap;
      const top = Math.min(
        Math.max(preferredTop, viewportPadding),
        Math.max(viewportPadding, viewportHeight - panelRect.height - viewportPadding),
      );

      setPanelStyle((current) =>
        current.left === left && current.top === top && current.visibility === 'visible'
          ? current
          : { left, top, visibility: 'visible' },
      );
    };

    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    if (triggerRef.current) resizeObserver.observe(triggerRef.current);
    if (panelRef.current) resizeObserver.observe(panelRef.current);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, isOpen]);

  const closePopover = () => setIsOpen(false);

  return (
    <div {...props} ref={containerRef} className={['relative inline-block', className].join(' ')}>
      <IconButton
        ref={triggerRef}
        aria-label={triggerLabel}
        aria-controls={panelId}
        aria-expanded={isOpen}
        size={triggerSize}
        variant={triggerVariant}
        className={triggerClassName}
        onClick={() => setIsOpen((current) => !current)}
      >
        {trigger}
      </IconButton>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            style={panelStyle}
            className={[
              'fixed z-50',
              'border border-border text-text-primary shadow-overlay',
              panelClassName,
            ].join(' ')}
          >
            {typeof children === 'function' ? children(closePopover) : children}
          </div>,
          document.body,
        )}
    </div>
  );
}
