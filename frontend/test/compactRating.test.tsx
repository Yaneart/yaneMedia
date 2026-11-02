import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import type { MediaSummary } from '../src/entities/media/model/media';
import type { RatingValue, RatingSummary } from '../src/entities/rating/model/rating';

// Run separately from suites that mock auth, social or API modules.
GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { render, cleanup, fireEvent, screen, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { MemoryRouter } = await import('react-router');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
const { socialQueryKeys } = await import('../src/features/social-data/model/socialQueryKeys');
const { UserRating } = await import('../src/features/user-rating/ui/UserRating');

const originalFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];
const email = 'rating@example.test';
const media: MediaSummary = {
  mediaRef: 'work_00000000-0000-4000-8000-000000000001' as MediaSummary['mediaRef'],
  slug: 'fixture',
  type: 'movie',
  title: 'Произведение',
  genres: [],
  rating: { value: 8.4, scale: 10 },
};

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  GlobalRegistrator.unregister();
});

function setup({
  guest = false,
  value = null,
  failWrite = false,
  restore = false,
  compact = true,
}: {
  guest?: boolean;
  value?: RatingValue | null;
  failWrite?: boolean;
  restore?: boolean;
  compact?: boolean;
} = {}) {
  let saved = value;
  const writes: Array<{ method: string; value?: number }> = [];
  const rating = () =>
    saved === null
      ? null
      : {
          media,
          value: saved,
          createdAt: '2026-11-02T00:00:00Z',
          updatedAt: '2026-11-02T00:00:00Z',
        };
  const summary = (): RatingSummary => ({
    average: saved,
    count: saved === null ? 0 : 1,
    distribution: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [String(i + 1), saved === i + 1 ? 1 : 0]),
    ) as RatingSummary['distribution'],
  });
  const profile = {
    handle: 'rating-fixture',
    email,
    displayName: 'Fixture',
    bio: '',
    avatarUrl: null,
    joinedAt: '2026-11-02T00:00:00Z',
    emailVerified: true,
    visibility: { ratings: true, favorites: true },
    counts: { ratings: value === null ? 0 : 1, reviews: 0, comments: 0, favorites: 0 },
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(socialQueryKeys.privateProfile(email), profile);
  client.setQueryData(socialQueryKeys.rating(media.mediaRef, email), rating());
  client.setQueryData(socialQueryKeys.ratingSummary(media.mediaRef), summary());
  globalThis.fetch = mock(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'PUT' || method === 'DELETE') {
      const next = method === 'PUT' ? JSON.parse(String(init?.body)).value : null;
      writes.push({ method, value: next });
      if (failWrite) return Response.json({ error: { code: 'HTTP_ERROR' } }, { status: 503 });
      saved = next;
      return method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ data: rating() });
    }
    return Response.json({
      data: url.endsWith('/ratings/summary')
        ? summary()
        : url.endsWith('/rating')
          ? { rating: rating() }
          : profile,
    });
  }) as typeof fetch;
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          { pathname: '/media/fixture', state: restore ? { socialActionIntent: 'rating' } : null },
        ]}
      >
        <AuthContext.Provider
          value={{
            state: guest
              ? { status: 'guest', user: null }
              : {
                  status: 'authenticated',
                  user: { email, displayName: 'Fixture', createdAt: profile.joinedAt },
                },
            setAuthenticated: () => {},
            setGuest: () => {},
            refresh: async () => {},
          }}
        >
          <UserRating media={media} compact={compact} embedded={!compact} />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, writes };
}

test('compact guest ratings keep the editor closed and offer a return-to-rating login', () => {
  const { writes } = setup({ guest: true });
  expect(screen.getByRole('group', { name: 'Оценки произведения' }).textContent).toContain('8.4');
  expect(screen.queryByRole('radio')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Оценить произведение' }));
  const href = screen.getByRole('link', { name: 'Войдите' }).getAttribute('href')!;
  expect(href).toContain('intent=rating');
  expect(href).toContain(encodeURIComponent('/media/fixture'));
  expect(writes).toEqual([]);
});

test('the compact editor creates, changes and deletes a rating with its aggregate', async () => {
  const { client, writes } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Оценить произведение' }));
  for (const value of [7, 9]) {
    fireEvent.click(
      screen.getByRole('radio', { name: `Поставить оценку ${value} из 10 на yaneMedia` }),
    );
    await waitFor(() => expect(writes).toHaveLength(value === 7 ? 1 : 2));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(
      screen.getByRole('button', { name: `Изменить оценку ${value} из 10` }).textContent,
    ).toContain(String(value));
    expect(client.getQueryData(socialQueryKeys.ratingSummary(media.mediaRef))).toMatchObject({
      average: value,
      count: 1,
    });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
  await waitFor(() => expect(writes).toHaveLength(3));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(screen.getByRole('button', { name: 'Оценить произведение' })).toBeTruthy();
  expect(client.getQueryData(socialQueryKeys.ratingSummary(media.mediaRef))).toMatchObject({
    average: null,
    count: 0,
  });
  expect(writes).toEqual([
    { method: 'PUT', value: 7 },
    { method: 'PUT', value: 9 },
    { method: 'DELETE', value: null },
  ]);
});

test('failed edits restore the previous rating and show the action error; Escape returns focus', async () => {
  const { client } = setup({ value: 8, failWrite: true });
  const trigger = screen.getByRole('button', { name: 'Изменить оценку 8 из 10' });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('radio', { name: 'Поставить оценку 3 из 10 на yaneMedia' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(screen.getByRole('alert').textContent).toContain('Предыдущее значение восстановлено');
  expect(
    (
      screen.getByRole('radio', {
        name: 'Поставить оценку 8 из 10 на yaneMedia',
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(client.getQueryData(socialQueryKeys.ratingSummary(media.mediaRef))).toMatchObject({
    average: 8,
    count: 1,
  });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('radio')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test('returning from login opens the compact editor and focuses the saved rating', async () => {
  setup({ value: 6, restore: true });
  const radio = await screen.findByRole('radio', { name: 'Поставить оценку 6 из 10 на yaneMedia' });
  await waitFor(() => expect(document.activeElement).toBe(radio));
});

test('the embedded review editor keeps direct access to all rating values', () => {
  setup({ compact: false, value: 8 });
  expect(screen.getAllByRole('radio')).toHaveLength(10);
  expect(screen.getByRole('button', { name: 'Удалить' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Изменить оценку 8 из 10' })).toBeNull();
});
