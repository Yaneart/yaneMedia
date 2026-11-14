export const COMPANION_ORIGIN = 'http://127.0.0.1:45723';
export const MIN_COMPANION_VERSION = '0.2.0';

function validVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 32 &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-dev)?$/.test(value)
  );
}

export class CompanionError extends Error {
  code: string;
  helperVersion?: string;

  constructor(code: string, helperVersion?: string) {
    super(code);
    this.code = code;
    if (validVersion(helperVersion)) this.helperVersion = helperVersion;
  }
}

export type CompanionHello = {
  product: 'yaneCompanion';
  helperVersion: string;
  api: { major: number; minor: number };
  bootId: string;
  capabilities: string[];
};

export type PairingRequest = {
  requestId: string;
  pollToken: string;
  code: string;
  expiresAt: string;
};

type PairingResult = {
  state: 'pending' | 'approved' | 'denied' | 'cancelled' | 'expired';
  pairingToken?: string;
};

export function validPairingToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

async function permissionDenied() {
  try {
    return (
      (await navigator.permissions?.query({ name: 'loopback-network' as PermissionName }))
        ?.state === 'denied'
    );
  } catch {
    return false;
  }
}

export async function companionRequest(
  path: string,
  method: string,
  signal: AbortSignal,
  token?: string,
  body?: unknown,
  key?: string,
  extraHeaders?: Record<string, string>,
) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method === 'POST') headers['Content-Type'] = 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  const options: RequestInit & { targetAddressSpace: 'loopback' } = {
    method,
    headers,
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    mode: 'cors',
    referrerPolicy: 'no-referrer',
    targetAddressSpace: 'loopback',
    // Controller revocation must survive pagehide/refresh of its owning page.
    ...(method === 'DELETE' && path === '/v1/controllers/current' ? { keepalive: true } : {}),
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  };
  let response: Response;
  try {
    response = await fetch(COMPANION_ORIGIN + path, options);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new CompanionError((await permissionDenied()) ? 'PERMISSION_DENIED' : 'UNAVAILABLE');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new CompanionError(body?.error?.code ?? 'UNAVAILABLE');
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new CompanionError('INVALID_RESPONSE');
  }
}

const request = companionRequest;

export async function hello(signal: AbortSignal): Promise<CompanionHello> {
  const result = await request('/hello', 'GET', signal);
  if (result?.product !== 'yaneCompanion' || !validVersion(result.helperVersion)) {
    throw new CompanionError('INVALID_RESPONSE');
  }
  if (Number.isInteger(result.api?.major) && result.api.major > 1) {
    throw new CompanionError('SITE_UPDATE_REQUIRED', result.helperVersion);
  }
  const installed = result.helperVersion.replace(/-dev$/, '').split('.').map(Number);
  const minimum = MIN_COMPANION_VERSION.split('.').map(Number);
  const different = installed.findIndex((part: number, index: number) => part !== minimum[index]);
  if (
    (different >= 0 && installed[different] < minimum[different]) ||
    result.api?.major !== 1 ||
    !Number.isInteger(result.api?.minor) ||
    result.api.minor < 0 ||
    !Array.isArray(result.capabilities) ||
    !result.capabilities.includes('pairing.v1')
  ) {
    throw new CompanionError('INCOMPATIBLE_VERSION', result.helperVersion);
  }
  return result;
}

export async function createPairing(signal: AbortSignal): Promise<PairingRequest> {
  const result = await request('/v1/pairings', 'POST', signal);
  if (
    !/^[a-f0-9]{32}$/.test(result?.requestId ?? '') ||
    !validPairingToken(result.pollToken) ||
    !/^\d{6}$/.test(result.code ?? '') ||
    !Number.isFinite(Date.parse(result.expiresAt))
  ) {
    throw new CompanionError('INVALID_RESPONSE');
  }
  return result;
}

export async function pollPairing(
  pairing: PairingRequest,
  signal: AbortSignal,
): Promise<PairingResult> {
  const result = await request(
    `/v1/pairings/${pairing.requestId}`,
    'GET',
    signal,
    pairing.pollToken,
  );
  if (
    !['pending', 'approved', 'denied', 'cancelled', 'expired'].includes(result?.state) ||
    (result.state === 'approved' && !validPairingToken(result.pairingToken))
  ) {
    throw new CompanionError('INVALID_RESPONSE');
  }
  return result;
}

export async function cancelPairing(pairing: PairingRequest) {
  await request(
    `/v1/pairings/${pairing.requestId}`,
    'DELETE',
    AbortSignal.timeout(3_000),
    pairing.pollToken,
  );
}

export async function checkPairing(token: string, signal: AbortSignal) {
  const result = await request('/v1/pairings/current', 'GET', signal, token);
  if (result?.state !== 'paired') throw new CompanionError('INVALID_RESPONSE');
}

export async function revokePairing(token: string, signal: AbortSignal) {
  await request('/v1/pairings/current', 'DELETE', signal, token);
}
