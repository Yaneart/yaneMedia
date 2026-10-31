import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
const { act } = await import('react');
const { cleanup, fireEvent, render, waitFor } = await import('@testing-library/react');
const { VirtualGrid } = await import('../src/shared/ui/VirtualGrid');
const { Select } = await import('../src/shared/ui/Select');

// Happy DOM has no layout. Supply geometry, but exercise the real virtualizer,
// scroll events and React tree. Responsive CSS is checked in Chromium.
Object.defineProperties(HTMLElement.prototype, {
  clientWidth: { configurable: true, get: () => 600 },
  clientHeight: {
    configurable: true,
    get() {
      return this.tagName === 'MAIN' ? 400 : 100;
    },
  },
  offsetHeight: { configurable: true, get: () => 100 },
  scrollHeight: { configurable: true, get: () => 100_000 },
});

describe('virtual episode menus', () => {
  const options = Array.from({ length: 1000 }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1} серия`,
  }));

  test('opens at the selected episode and navigates to unmounted options with End/Home/arrows', async () => {
    const selected: Array<string | null> = [];
    const view = render(
      <Select
        virtualized
        aria-label="Episode"
        options={options}
        value="850"
        placeholder="Select episode"
        allowEmpty={false}
        matchMenuWidth
        onChange={(value) => selected.push(value)}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Episode' }));
    await waitFor(() => expect(document.activeElement?.textContent).toContain('850 серия'));
    expect(view.getAllByRole('option').length).toBeLessThan(30);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    await waitFor(() => expect(document.activeElement?.textContent).toContain('1000 серия'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement?.textContent).toContain('1 серия'));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    fireEvent.click(document.activeElement!);
    expect(selected).toEqual(['1']);
    expect(view.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(view.getByRole('button', { name: 'Episode' }));
  });

  test('replaces a long episode list safely while its menu is open', async () => {
    const props = {
      virtualized: true,
      'aria-label': 'Episode',
      value: '1',
      placeholder: 'Select',
      onChange: () => {},
    };
    const view = render(<Select {...props} options={options} />);
    fireEvent.click(view.getByRole('button', { name: 'Episode' }));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    await waitFor(() => expect(document.activeElement?.textContent).toContain('1000 серия'));
    view.rerender(<Select {...props} options={options.slice(0, 200)} />);
    await waitFor(() => expect(document.activeElement?.textContent).toContain('1 серия'));
    expect(
      view.container.querySelector('[data-virtual-options]')?.getAttribute('data-virtual-options'),
    ).toBe('201');
    expect(view.getAllByRole('option').length).toBeLessThan(30);
  });

  test('keeps outside-click/Escape dismissal and leaves short or non-opted-in menus unchanged', () => {
    const view = render(
      <>
        <Select
          virtualized
          aria-label="Episode"
          options={options}
          value="1"
          placeholder="Select"
          onChange={() => {}}
        />
        <button>Outside</button>
      </>,
    );
    fireEvent.click(view.getByRole('button', { name: 'Episode' }));
    fireEvent.pointerDown(view.getByRole('button', { name: 'Outside' }));
    expect(view.queryByRole('listbox')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Episode' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(view.queryByRole('listbox')).toBeNull();
    view.rerender(
      <Select
        virtualized
        aria-label="Episode"
        options={options.slice(0, 10)}
        value="1"
        placeholder="Select"
        onChange={() => {}}
      />,
    );
    fireEvent.click(view.getByRole('button', { name: 'Episode' }));
    expect(view.getAllByRole('option').length).toBe(11);
    expect(view.container.querySelector('[data-virtual-options]')).toBeNull();
    view.rerender(
      <Select
        aria-label="Episode"
        options={options}
        value="1"
        placeholder="Select"
        onChange={() => {}}
      />,
    );
    expect(view.getAllByRole('option').length).toBe(1001);
    expect(view.container.querySelector('[data-virtual-options]')).toBeNull();
  });
});
HTMLElement.prototype.getBoundingClientRect = function () {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 600,
    bottom: 400,
    width: 600,
    height: 400,
    toJSON() {},
  };
};
HTMLElement.prototype.scrollTo = function (options: ScrollToOptions | number) {
  if (typeof options === 'object') this.scrollTop = options.top ?? this.scrollTop;
  this.dispatchEvent(new Event('scroll'));
};

const items = Array.from({ length: 100 }, (_, index) => (
  <article key={index}>
    <a href={`#item-${index}`}>Item {index}</a>
    <button>Save {index}</button>
  </article>
));

function Grid({ enabled = true, horizontal = false }: { enabled?: boolean; horizontal?: boolean }) {
  return (
    <main>
      <VirtualGrid
        enabled={enabled}
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 280px',
          gridAutoFlow: horizontal ? 'column' : 'row',
          rowGap: 24,
          columnGap: 16,
        }}
      >
        {items}
      </VirtualGrid>
    </main>
  );
}

afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

describe('virtual card grids', () => {
  test('keeps small/static and desktop horizontal lists intact when virtualization is disabled', () => {
    const view = render(<Grid enabled={false} />);
    expect(view.container.querySelectorAll('article').length).toBe(100);
    expect(view.container.querySelector('[data-virtual-grid]')).toBeNull();
    view.rerender(<Grid horizontal />);
    expect(view.container.querySelectorAll('article').length).toBe(100);
    expect(view.container.querySelector('[data-virtual-grid]')).toBeNull();
  });

  test('bounds mounted cards while retaining the full scroll extent and reaches later items', async () => {
    const view = render(<Grid />);
    const grid = view.container.querySelector<HTMLElement>('[data-virtual-grid]')!;
    expect(grid.dataset.virtualCount).toBe('100');
    expect(view.container.querySelectorAll('article').length).toBeLessThan(30);
    expect(parseFloat(grid.style.height)).toBeGreaterThan(1000);
    const main = view.container.querySelector('main')!;
    act(() => {
      main.scrollTop = 3000;
      fireEvent.scroll(main);
    });
    await waitFor(() => expect(view.container.querySelector('a[href="#item-12"]')).not.toBeNull());
    expect(view.container.querySelector('a[href="#item-0"]')).toBeNull();
    expect(view.container.querySelectorAll('article').length).toBeLessThan(30);
  });

  test('keeps the focused card mounted when it leaves the visible range', async () => {
    const view = render(<Grid />);
    const link = view.container.querySelector<HTMLAnchorElement>('a')!;
    act(() => link.focus());
    const main = view.container.querySelector('main')!;
    act(() => {
      main.scrollTop = 3000;
      fireEvent.scroll(main);
    });
    await waitFor(() => expect(view.container.querySelector('a[href="#item-12"]')).not.toBeNull());
    expect(document.activeElement).toBe(link);
    expect(link.isConnected).toBe(true);
    expect(view.container.querySelectorAll('article').length).toBeLessThan(32);
  });

  test('Tab can move to the next logical card beyond the mounted range', async () => {
    const view = render(<Grid />);
    const articles = view.container.querySelectorAll('article');
    const last = articles[articles.length - 1];
    const nextIndex = Number(last.querySelector('a')!.hash.replace('#item-', '')) + 1;
    const button = last.querySelector('button')!;
    act(() => {
      button.focus();
      fireEvent.keyDown(button, { key: 'Tab' });
    });
    await waitFor(() =>
      expect((document.activeElement as HTMLAnchorElement).hash).toBe(`#item-${nextIndex}`),
    );
  });
});
