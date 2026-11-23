import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { ComponentProps } from 'react';

GlobalRegistrator.register();
const { cleanup, fireEvent, render } = await import('@testing-library/react');
const { InfiniteScroll } = await import('../src/shared/ui/InfiniteScroll');

type PaginationQuery = ComponentProps<typeof InfiniteScroll>['query'];
const observers: TestObserver[] = [];
const originalObserver = globalThis.IntersectionObserver;

class TestObserver {
  target?: Element;
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit;
  disconnect = mock(() => {});

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    observers.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }

  intersect(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function setup() {
  const fetchNextPage = mock<PaginationQuery['fetchNextPage']>();
  const base: PaginationQuery = {
    data: { pages: [[]], pageParams: [0] },
    fetchNextPage,
    hasNextPage: true,
    isEnabled: true,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isPaused: false,
    isPlaceholderData: false,
  };
  const view = (query: Partial<PaginationQuery> = {}, disabled = false) => (
    <main>
      <InfiniteScroll query={{ ...base, ...query }} disabled={disabled} />
    </main>
  );
  return { fetchNextPage, view };
}

beforeEach(() => {
  observers.length = 0;
  globalThis.IntersectionObserver = TestObserver as unknown as typeof IntersectionObserver;
});
afterEach(cleanup);
afterAll(() => {
  globalThis.IntersectionObserver = originalObserver;
  return GlobalRegistrator.unregister();
});

describe('InfiniteScroll', () => {
  test('observes the app scroll container and fetches once per page', () => {
    const { fetchNextPage, view } = setup();
    const { container, rerender, unmount } = render(view());
    const first = observers[0]!;
    expect(first.options.root).toBe(container.querySelector('main'));
    expect(first.target?.parentElement).toBe(first.options.root);
    first.intersect(false);
    expect(fetchNextPage).not.toHaveBeenCalled();
    rerender(view());
    expect(observers).toHaveLength(1);
    first.intersect(true);
    first.intersect(true);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).toHaveBeenLastCalledWith({ cancelRefetch: false });

    rerender(view({ data: { pages: [[], []], pageParams: [0, 1] } }));
    const second = observers[1]!;
    second.intersect(true);
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
    unmount();
    expect(second.disconnect).toHaveBeenCalled();
    second.intersect(true);
    expect(fetchNextPage).toHaveBeenCalledTimes(2);
  });

  test('waits for an idle, current query and only retries a failure on demand', () => {
    const { fetchNextPage, view } = setup();
    const { getByRole, queryByRole, rerender } = render(view({ isPlaceholderData: true }));
    rerender(view({ isPaused: true }));
    rerender(view({ isFetching: true }));
    rerender(view({ isEnabled: false }));
    rerender(view({}, true));
    expect(observers).toHaveLength(0);
    rerender(view({ isFetching: true, isFetchingNextPage: true }));
    expect(getByRole('status')).toBeTruthy();
    rerender(view({ isFetchNextPageError: true }));
    expect(observers).toHaveLength(0);
    expect(getByRole('alert')).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'Попробовать снова' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    rerender(view({ hasNextPage: false }));
    expect(queryByRole('button')).toBeNull();
    expect(observers).toHaveLength(0);
  });
});
