const internalOrigin = 'https://internal.invalid';

export function createReturnToSearch(returnTo: string) {
  return `?${new URLSearchParams({ returnTo }).toString()}`;
}

export function parseInternalReturnTo(value: string | null) {
  if (!value?.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  try {
    const url = new URL(value, internalOrigin);

    if (url.origin !== internalOrigin) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
