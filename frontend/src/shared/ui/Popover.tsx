import { IconButton } from './IconButton';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';

export type PopoverAlign = 'start' | 'end';

export type PopoverProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  trigger: ReactNode;
  triggerLabel: string;
  children: ReactNode;
  align?: PopoverAlign;
};

export function Popover({
  trigger,
  triggerLabel,
  children,
  align = 'end',
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

  const alignClass = align === 'end' ? 'right-0' : 'left-0';

  return (
    <div {...props} ref={containerRef} className={['relative inline-block', className].join(' ')}>
      <IconButton
        ref={triggerRef}
        aria-label={triggerLabel}
        aria-controls={panelId}
        aria-expanded={isOpen}
        variant="ghost"
        onClick={() => setIsOpen((current) => !current)}
      >
        {trigger}
      </IconButton>

      {isOpen && (
        <div
          id={panelId}
          className={[
            'absolute top-full z-20 mt-2 min-w-48',
            'rounded-overlay border border-border bg-popover',
            'p-2 text-text-primary shadow-overlay',
            alignClass,
          ].join(' ')}
        >
          {children}
        </div>
      )}
    </div>
  );
}
