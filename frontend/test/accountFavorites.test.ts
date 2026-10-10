import { describe, expect, it, mock } from 'bun:test';

mock.module('@/entities/auth', () => ({ accountQueryKey: ['account'] }));

const { applyFavoriteChange } = await import('../src/features/favorite/model/accountFavorites');

describe('account favorite optimistic updates', () => {
  it('preserves another optimistic favorite when one mutation settles', () => {
    const first = 'work_11111111-1111-4111-8111-111111111111';
    const second = 'work_22222222-2222-4222-8222-222222222222';
    const optimistic = applyFavoriteChange(
      applyFavoriteChange({ mediaRefs: [] }, { type: 'add', mediaRefs: [first] }),
      { type: 'add', mediaRefs: [second] },
    );

    expect(applyFavoriteChange(optimistic, { type: 'add', mediaRefs: [first] })).toEqual({
      mediaRefs: [second, first],
    });
  });
});
