import {
  createInitialHandle,
  HANDLE_PATTERN,
  isHandleAllowed,
  normalizeHandle,
  RESERVED_HANDLES,
} from '../../src/users/handle';

describe('user handles', () => {
  it('normalizes user input before validation or persistence', () => {
    expect(normalizeHandle('  Yane_Art  ')).toBe('yane_art');
  });

  it.each(['ab', 'contains-dash', 'кино', 'a'.repeat(31)])(
    'rejects invalid handle %s',
    (handle) => {
      expect(isHandleAllowed(handle)).toBe(false);
    },
  );

  it('reserves contract and application route names', () => {
    expect(RESERVED_HANDLES).toEqual(
      expect.arrayContaining(['admin', 'api', 'login', 'profile', 'media', 'search', 'favorites']),
    );
    expect(RESERVED_HANDLES.every((handle) => !isHandleAllowed(handle))).toBe(true);
  });

  it('derives a stable, valid handle from the complete UUID without personal data', () => {
    const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';
    const handle = createInitialHandle(userId);

    expect(handle).toBe(createInitialHandle(userId));
    expect(handle).toMatch(HANDLE_PATTERN);
    expect(handle).toHaveLength(28);
    expect(handle).not.toContain('artem');
    expect(createInitialHandle('93ea2794-e805-4f60-b14f-2005d2c61805')).not.toBe(handle);
  });

  it('rejects a non-UUID source instead of silently creating a weak handle', () => {
    expect(() => createInitialHandle('not-a-uuid')).toThrow('User ID must be a UUID');
  });
});
