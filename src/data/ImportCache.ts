import type { Bounds } from '../types/editor';
import type { ImportResult } from '../types/features';

/**
 * Persistent cache of imported tiles in IndexedDB. Large builds (thousands of tiles) do not fit in
 * localStorage, and caching every finished tile lets an interrupted or cancelled build resume instantly.
 * All functions are best-effort and never throw.
 */

const DB_NAME = 'dwb-tiles';
const STORE = 'tiles';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const keyFor = (b: Bounds) => [b.west, b.south, b.east, b.north].map((n) => n.toFixed(5)).join(',');

interface Entry {
  t: number;
  result: ImportResult;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const wrap = <T>(req: IDBRequest<T>): Promise<T | undefined> =>
  new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });

export async function getCached(b: Bounds): Promise<ImportResult | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const entry = (await wrap(store.get(keyFor(b)))) as Entry | undefined;
    if (!entry) return null;
    if (Date.now() - entry.t > TTL_MS) {
      void deleteCached(b);
      return null;
    }
    return entry.result;
  } catch {
    return null;
  }
}

export async function putCached(b: Bounds, result: ImportResult): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ t: Date.now(), result } satisfies Entry, keyFor(b));
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve(); // e.g. quota exceeded: carry on without caching
    });
  } catch {
    /* ignore */
  }
}

async function deleteCached(b: Bounds): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(keyFor(b));
  } catch {
    /* ignore */
  }
}

/** Remove every cached tile (used by a "clear cache" action). */
export async function clearCache(): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
