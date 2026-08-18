import { IconButton, type IconButtonProps } from './IconButton';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';

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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const container = containerRef.current;

      if (container && !container.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleFocusIn(event: FocusEvent) {
      const container = containerRef.current;

      if (container && !container.contains(event.target as Node)) {
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

  const alignClasses: Record<PopoverAlign, string> = {
    start: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    end: 'right-0',
  };
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

      {isOpen && (
        <div
          id={panelId}
          className={[
            'absolute top-full z-20 mt-2',
            'border border-border text-text-primary shadow-overlay',
            alignClasses[align],
            panelClassName,
          ].join(' ')}
        >
          {typeof children === 'function' ? children(closePopover) : children}
        </div>
      )}
    </div>
  );
}
