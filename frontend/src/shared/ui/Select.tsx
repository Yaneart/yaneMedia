import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { CheckIcon, DownIcon } from './Icons';

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectProps = Omit<ComponentPropsWithoutRef<'div'>, 'onChange'> & {
  'aria-label': string;
  value: string | null;
  options: readonly SelectOption[];
  placeholder: string;
  onChange: (value: string | null) => void;
};

export function Select({
  'aria-label': ariaLabel,
  value,
  options,
  placeholder,
  onChange,
  className = '',
  ...props
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedIndex =
      value === null ? 0 : Math.max(0, options.findIndex((option) => option.value === value) + 1);

    const frameId = requestAnimationFrame(() => {
      optionRefs.current[selectedIndex]?.focus();
    });

    return () => cancelAnimationFrame(frameId);
  }, [isOpen, options, value]);

  const selectValue = (nextValue: string | null) => {
    onChange(nextValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  const handleListboxKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const optionElements = optionRefs.current.filter(
      (option): option is HTMLButtonElement => option !== null,
    );

    const currentIndex = optionElements.indexOf(document.activeElement as HTMLButtonElement);

    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % optionElements.length;
    }

    if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + optionElements.length) % optionElements.length;
    }

    if (event.key === 'Home') {
      nextIndex = 0;
    }

    if (event.key === 'End') {
      nextIndex = optionElements.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      optionElements[nextIndex]?.focus();
    }
  };

  return (
    <div {...props} ref={containerRef} className={['relative inline-block', className].join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className={[
          'flex min-h-11 w-full min-w-0 items-center justify-between gap-3 sm:min-w-40',
          'rounded-control border border-border bg-control px-3',
          'text-sm text-text-primary',
          'transition-[background-color,border-color,box-shadow,transform]',
          'duration-200 ease-out active:scale-[0.985] active:duration-75',
          'hover:border-text-secondary hover:bg-control-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20',
          'motion-reduce:transform-none motion-reduce:transition-none',
        ].join(' ')}
      >
        <span className="truncate">{selectedOption?.label ?? placeholder}</span>

        <DownIcon
          aria-hidden="true"
          className={[
            'size-4 text-text-secondary transition-transform duration-200 ease-out',
            'motion-reduce:transition-none',
            isOpen ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleListboxKeyDown}
          className={[
            'absolute top-full left-0 z-30 mt-2 w-max min-w-full overflow-hidden',
            'rounded-overlay border border-border bg-popover p-1 shadow-overlay',
          ].join(' ')}
        >
          <button
            ref={(element) => {
              optionRefs.current[0] = element;
            }}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={value === null}
            onClick={() => selectValue(null)}
            className={[
              'flex min-h-10 w-full items-center justify-between gap-3 rounded-control px-3',
              'whitespace-nowrap',
              'text-left text-sm transition-colors duration-200 ease-out',
              'hover:bg-interactive-hover motion-reduce:transition-none',
              value === null ? 'text-text-primary' : 'text-text-secondary',
            ].join(' ')}
          >
            {placeholder}
            <CheckIcon
              aria-hidden="true"
              className={['size-4', value === null ? '' : 'invisible'].join(' ')}
            />
          </button>

          {options.map((option, index) => {
            const isSelected = option.value === value;

            return (
              <button
                ref={(element) => {
                  optionRefs.current[index + 1] = element;
                }}
                key={option.value}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                onClick={() => selectValue(option.value)}
                className={[
                  'flex min-h-10 w-full items-center justify-between gap-3 rounded-control px-3',
                  'whitespace-nowrap',
                  'text-left text-sm transition-colors duration-200 ease-out',
                  'hover:bg-interactive-hover motion-reduce:transition-none',
                  isSelected ? 'text-text-primary' : 'text-text-secondary',
                ].join(' ')}
              >
                {option.label}
                <CheckIcon
                  aria-hidden="true"
                  className={['size-4', isSelected ? '' : 'invisible'].join(' ')}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
