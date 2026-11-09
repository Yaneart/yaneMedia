import { CompanionError, companionRequest, validPairingToken } from '../api/companionClient';

const key = 'yanemedia-companion-pending-close';
type PendingClose = { token: string; expiresAt: number };

function pendingCloses(): PendingClose[] {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]');
    return Array.isArray(stored)
      ? stored
          .filter(
            (item): item is PendingClose =>
              item &&
              validPairingToken(item.token) &&
              Number.isFinite(item.expiresAt) &&
              item.expiresAt > Date.now() &&
              item.expiresAt <= Date.now() + 180_000,
          )
          .slice(-8)
      : [];
  } catch {
    return [];
  }
}

function save(closes: PendingClose[]) {
  try {
    if (closes.length) sessionStorage.setItem(key, JSON.stringify(closes));
    else sessionStorage.removeItem(key);
  } catch {
    // keepalive is still attempted; helper lease bounds an unreachable controller.
  }
}

async function revoke(token: string, signal: AbortSignal) {
  try {
    await companionRequest('/v1/controllers/current', 'DELETE', signal, token);
  } catch (error) {
    if (!(error instanceof CompanionError) || error.code !== 'CONTROLLER_REQUIRED') throw error;
  }
  save(pendingCloses().filter((item) => item.token !== token));
}

export function closeController(token: string) {
  // This short-lived tab proof can only be used to DELETE an abandoned controller.
  // It never restores playback, renews a lease, or enters history/account storage.
  save(
    [
      ...pendingCloses().filter((item) => item.token !== token),
      { token, expiresAt: Date.now() + 180_000 },
    ].slice(-8),
  );
  return revoke(token, AbortSignal.timeout(5000));
}

export async function closePendingControllers(signal: AbortSignal) {
  for (const { token } of pendingCloses()) {
    signal.throwIfAborted();
    await revoke(token, AbortSignal.any([signal, AbortSignal.timeout(5000)]));
  }
}
