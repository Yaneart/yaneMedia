export function getProfileInitial(displayName: string, handle: string): string {
  const source = displayName.trim() || handle.trim();
  return Array.from(source)[0]?.toLocaleUpperCase('ru-RU') ?? '?';
}

export function getProfileCountHint(count: number): string {
  return count === 0 ? 'Пока нет' : 'Всего';
}

export function isGeneratedProfileHandle(handle: string): boolean {
  return /^u_[0-9abcdefghjkmnpqrstvwxyz]{26}$/.test(handle);
}
