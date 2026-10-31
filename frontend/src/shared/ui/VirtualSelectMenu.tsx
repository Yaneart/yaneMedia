import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CheckIcon } from './Icons';
import type { SelectOption } from './Select';

type Props = {
  id: string;
  label: string;
  className: string;
  options: readonly SelectOption[];
  value: string | null;
  placeholder: string;
  allowEmpty: boolean;
  onSelect: (value: string | null) => void;
  onClose: () => void;
};

export function VirtualSelectMenu({
  id,
  label,
  className,
  options,
  value,
  placeholder,
  allowEmpty,
  onSelect,
  onClose,
}: Props) {
  'use no memo';
  const items = useMemo(
    () => (allowEmpty ? [{ value: null, label: placeholder }, ...options] : options),
    [allowEmpty, options, placeholder],
  );
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const activeOptionIndex = Math.min(activeIndex, items.length - 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(selectedIndex);
  const getItemKey = useCallback((index: number) => items[index].value ?? 'empty', [items]);
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indices = defaultRangeExtractor(range);
      return indices.includes(activeOptionIndex)
        ? indices
        : [...indices, activeOptionIndex].sort((a, b) => a - b);
    },
    [activeOptionIndex],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    initialOffset: selectedIndex * 40,
    overscan: 4,
    useFlushSync: false,
    getItemKey,
    rangeExtractor,
  });

  useLayoutEffect(() => {
    pendingFocus.current = selectedIndex;
    setActiveIndex(selectedIndex);
    virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex, items.length, virtualizer]);

  useLayoutEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    const button = scrollRef.current?.querySelector<HTMLButtonElement>(
      `[data-option-index="${index}"]`,
    );
    if (button) {
      pendingFocus.current = null;
      button.focus({ preventScroll: true });
    }
  });

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    let index: number;
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = items.length - 1;
    else if (event.key === 'ArrowDown') index = (activeOptionIndex + 1) % items.length;
    else if (event.key === 'ArrowUp') index = (activeOptionIndex - 1 + items.length) % items.length;
    else return;
    event.preventDefault();
    pendingFocus.current = index;
    setActiveIndex(index);
    virtualizer.scrollToIndex(index, { align: 'auto' });
  };

  return (
    <div
      id={id}
      role="listbox"
      aria-label={label}
      ref={scrollRef}
      className={className}
      onKeyDown={handleKeyDown}
      data-virtual-options={items.length}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          const selected = item.value === value;
          return (
            <button
              key={row.key}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={selected}
              aria-posinset={row.index + 1}
              aria-setsize={items.length}
              data-option-index={row.index}
              onFocus={() => setActiveIndex(row.index)}
              onClick={() => onSelect(item.value)}
              style={{ position: 'absolute', top: row.start, left: 0, height: row.size }}
              className={`flex min-h-10 w-full min-w-0 items-center justify-between gap-3 rounded-control px-3 whitespace-nowrap text-left text-sm transition-colors duration-200 ease-out hover:bg-interactive-hover motion-reduce:transition-none ${selected ? 'text-text-primary' : 'text-text-secondary'}`}
            >
              <span className="truncate">{item.label}</span>
              <CheckIcon aria-hidden="true" className={`size-4 ${selected ? '' : 'invisible'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
