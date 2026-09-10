import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithRef,
  type UIEvent,
} from 'react';

import { ContentRow, type ContentRowProps } from '@/shared';
import { useRowScrollRestoration } from '../model/useRowScrollRestoration';

export type RestorableContentRowProps = ContentRowProps & {
  scrollKey: string;
};

export function RestorableContentRow({
  scrollKey,
  ref,
  onScroll,
  ...props
}: RestorableContentRowProps) {
  const scrollRestoration = useRowScrollRestoration();
  const rowRef = useRef<HTMLDivElement | null>(null);

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

  useLayoutEffect(() => {
    const row = rowRef.current;

    if (!row || !scrollRestoration) return;

    row.scrollLeft = scrollRestoration.getScrollLeft(scrollKey);
  }, [scrollKey, scrollRestoration]);

  const handleScroll: ComponentPropsWithRef<'div'>['onScroll'] = (
    event: UIEvent<HTMLDivElement>,
  ) => {
    scrollRestoration?.saveScrollLeft(scrollKey, event.currentTarget.scrollLeft);
    onScroll?.(event);
  };

  return <ContentRow {...props} ref={setRowRef} onScroll={handleScroll} />;
}
