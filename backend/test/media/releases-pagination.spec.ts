import { paginateReleases } from '../../src/media/releases/releases-pagination';
import type { ReleaseItem } from '../../src/media/releases/releases.service';

const items = (start: number, count: number) =>
  Array.from(
    { length: count },
    (_, index) => ({ mediaRef: `work-${start + index}` }) as ReleaseItem,
  );

describe('release pagination', () => {
  it.each([9, 16, 20, 40])(
    'fills 24 cards from provider batches of %i without duplicates or gaps',
    async (size) => {
      const fetchPage = jest.fn(async (page: number) => ({
        items: items((page - 1) * size, size),
        hasMore: page < 10,
        partial: false,
      }));
      const first = await paginateReleases(1, fetchPage);
      const second = await paginateReleases(2, fetchPage);
      expect(first.items).toHaveLength(24);
      expect(second.items).toHaveLength(24);
      expect(first.hasMore).toBe(true);
      expect([...first.items, ...second.items].map((item) => item.mediaRef)).toEqual(
        items(0, 48).map((item) => item.mediaRef),
      );
    },
  );
  it('skips empty filtered batches and deduplicates before counting', async () => {
    const result = await paginateReleases(1, async (page) => ({
      items: page === 1 ? [] : items(0, page === 2 ? 16 : 30),
      hasMore: page < 3,
      partial: page === 2,
    }));
    expect(result.items).toHaveLength(24);
    expect(result.hasMore).toBe(true);
    expect(result.partial).toBe(true);
  });
  it('returns a shorter page only at the end and hides load more at an exact boundary', async () => {
    const fetchPage = async () => ({ items: items(0, 30), hasMore: false, partial: false });
    expect((await paginateReleases(2, fetchPage)).items).toHaveLength(6);
    expect((await paginateReleases(2, fetchPage)).hasMore).toBe(false);
    expect(
      (
        await paginateReleases(1, async () => ({
          items: items(0, 24),
          hasMore: false,
          partial: false,
        }))
      ).hasMore,
    ).toBe(false);
  });
});
