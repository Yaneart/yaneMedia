let accountController = new AbortController();
const playerStops = new Set<() => void>();

export function torrentAccountSignal(): AbortSignal {
  return accountController.signal;
}

export function registerTorrentPlayerStop(stop: () => void): () => void {
  playerStops.add(stop);
  return () => playerStops.delete(stop);
}

export function resetTorrentClientScope(): void {
  accountController.abort();
  accountController = new AbortController();
  for (const stop of playerStops) stop();
}
