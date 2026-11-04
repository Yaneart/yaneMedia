import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { CheckIcon, DownIcon } from './Icons';
import { VirtualSelectMenu } from './VirtualSelectMenu';

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
  matchMenuWidth?: boolean;
  allowEmpty?: boolean;
  menuPlacement?: 'top' | 'bottom';
  menuAlign?: 'start' | 'end';
  virtualized?: boolean;
};

export function Select({
  'aria-label': ariaLabel,
  value,
  options,
  placeholder,
  onChange,
  matchMenuWidth = false,
  allowEmpty = true,
  menuPlacement = 'bottom',
  menuAlign = 'start',
  virtualized = false,
  className = '',
  ...props
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const useVirtualMenu = virtualized && options.length > 40;

  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedOption = options.find((option) => option.value === value);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      let visibleTop = 16;
      let visibleBottom = document.documentElement.clientHeight - 16;
      for (
        let parent = containerRef.current?.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
        const bounds = parent.getBoundingClientRect();
        visibleTop = Math.max(visibleTop, bounds.top + parent.clientTop);
        visibleBottom = Math.min(
          visibleBottom,
          bounds.top + parent.clientTop + parent.clientHeight,
        );
      }
      const below = Math.max(0, visibleBottom - rect.bottom - 8);
      const above = Math.max(0, rect.top - visibleTop - 8);
      const height = Math.min(menu.firstElementChild?.scrollHeight ?? 0, 328);
      const openAbove =
        menuPlacement === 'top'
          ? above >= height || above > below
          : below < height && above > below;
      const width = Math.min(matchMenuWidth ? rect.width : menu.offsetWidth, viewportWidth - 32);
      const left = menuAlign === 'end' ? rect.right - width : rect.left;

      setMenuStyle({
        visibility: 'visible',
        left: Math.max(16, Math.min(left, viewportWidth - width - 16)) - rect.left,
        ...(openAbove ? { bottom: 'calc(100% + 0.5rem)' } : { top: 'calc(100% + 0.5rem)' }),
        ...(matchMenuWidth ? { width: rect.width } : { minWidth: rect.width }),
        maxHeight: Math.min(328, openAbove ? above : below),
      });
    };

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (menuRef.current) observer.observe(menuRef.current);
    if (triggerRef.current) observer.observe(triggerRef.current);
    window.addEventListener('resize', updatePosition);
    const handleScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) updatePosition();
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, matchMenuWidth, menuAlign, menuPlacement, options.length, allowEmpty]);

  const focusOption = (option: HTMLButtonElement | null | undefined) => {
    if (!option) return;
    option.focus({ preventScroll: true });
    const listbox = option.parentElement;
    if (!listbox) return;
    const optionRect = option.getBoundingClientRect();
    const listRect = listbox.getBoundingClientRect();
    const top = listRect.top + listbox.clientTop;
    const bottom = top + listbox.clientHeight;
    if (optionRect.top < top) listbox.scrollTop -= top - optionRect.top;
    else if (optionRect.bottom > bottom) listbox.scrollTop += optionRect.bottom - bottom;
  };

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
        triggerRef.current?.focus({ preventScroll: true });
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
    if (!isOpen || useVirtualMenu) {
      return;
    }

    const optionOffset = allowEmpty ? 1 : 0;
    const selectedIndex =
      value === null
        ? 0
        : Math.max(0, options.findIndex((option) => option.value === value) + optionOffset);

    const frameId = requestAnimationFrame(() => {
      focusOption(optionRefs.current[selectedIndex]);
    });

    return () => cancelAnimationFrame(frameId);
  }, [allowEmpty, isOpen, options, value, useVirtualMenu]);

  const selectValue = (nextValue: string | null) => {
    onChange(nextValue);
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && isOpen) {
      event.stopPropagation();
      setIsOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
    }
  };

  const handleListboxKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
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
      focusOption(optionElements[nextIndex]);
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
          ref={menuRef}
          style={menuStyle}
          className="absolute z-50 w-max max-w-[calc(100vw-2rem)]"
        >
          {useVirtualMenu ? (
            <VirtualSelectMenu
              id={listboxId}
              label={ariaLabel}
              options={options}
              value={value}
              placeholder={placeholder}
              allowEmpty={allowEmpty}
              onSelect={selectValue}
              onClose={() => {
                setIsOpen(false);
                triggerRef.current?.focus({ preventScroll: true });
              }}
              className={[
                'max-h-[inherit] w-full overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                'rounded-overlay border border-border bg-popover p-1 shadow-overlay',
              ].join(' ')}
            />
          ) : (
            <div
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              onKeyDown={handleListboxKeyDown}
              className={[
                'max-h-[inherit] w-full overflow-x-hidden overflow-y-auto overscroll-contain',
                '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                'rounded-overlay border border-border bg-popover p-1 shadow-overlay',
              ].join(' ')}
            >
              {allowEmpty && (
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
                    'flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-control px-3',
                    'whitespace-nowrap',
                    'text-left text-sm transition-colors duration-200 ease-out',
                    'hover:bg-interactive-hover motion-reduce:transition-none',
                    value === null ? 'text-text-primary' : 'text-text-secondary',
                  ].join(' ')}
                >
                  <span className="truncate">{placeholder}</span>
                  <CheckIcon
                    aria-hidden="true"
                    className={['size-4', value === null ? '' : 'invisible'].join(' ')}
                  />
                </button>
              )}

              {options.map((option, index) => {
                const isSelected = option.value === value;

                return (
                  <button
                    ref={(element) => {
                      optionRefs.current[index + (allowEmpty ? 1 : 0)] = element;
                    }}
                    key={option.value}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={isSelected}
                    onClick={() => selectValue(option.value)}
                    className={[
                      'flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-control px-3',
                      'whitespace-nowrap',
                      'text-left text-sm transition-colors duration-200 ease-out',
                      'hover:bg-interactive-hover motion-reduce:transition-none',
                      isSelected ? 'text-text-primary' : 'text-text-secondary',
                    ].join(' ')}
                  >
                    <span className="truncate">{option.label}</span>
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
      )}
    </div>
  );
}
