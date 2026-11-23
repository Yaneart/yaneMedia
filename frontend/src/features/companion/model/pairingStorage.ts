import { COMPANION_ORIGIN, validPairingToken } from '../api/companionClient';

// IndexedDB is isolated by site origin and browser profile; grants never enter account storage.
async function access(mode: IDBTransactionMode, value?: string | null): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let failed = false;
    const open = indexedDB.open('yanemedia-companion', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('pairings');
    open.onerror = open.onblocked = () => {
      failed = true;
      reject(new Error('PAIRING_STORAGE_UNAVAILABLE'));
    };
    open.onsuccess = () => {
      const database = open.result;
      database.onversionchange = () => database.close();
      if (failed) {
        database.close();
        return;
      }
      try {
        const transaction = database.transaction('pairings', mode);
        const store = transaction.objectStore('pairings');
        const key = `${location.origin}|${COMPANION_ORIGIN}`;
        const operation =
          value === undefined
            ? store.get(key)
            : value === null
              ? store.delete(key)
              : store.put(value, key);
        let result: string | null = null;
        operation.onsuccess = () => {
          result = validPairingToken(operation.result) ? operation.result : null;
        };
        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = transaction.onabort = () => {
          database.close();
          reject(new Error('PAIRING_STORAGE_UNAVAILABLE'));
        };
      } catch {
        database.close();
        reject(new Error('PAIRING_STORAGE_UNAVAILABLE'));
      }
    };
  });
}

const listeners = new Set<(hasPairing: boolean) => void>();

async function save(token: string | null) {
  await access('readwrite', token);
  listeners.forEach((listener) => listener(token !== null));
}

export const pairingStorage = {
  read: () => access('readonly'),
  write: (token: string) => save(token),
  clear: () => save(null),
  subscribe(listener: (hasPairing: boolean) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
