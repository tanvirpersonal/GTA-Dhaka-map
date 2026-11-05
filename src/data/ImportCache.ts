import type { Bounds } from '../types/editor';
import type { ImportResult } from '../types/features';

const PREFIX = 'dwb:osm:';
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 3_000_000;

const keyFor = (b: Bounds) => `${PREFIX}${[b.west, b.south, b.east, b.north].map((n) => n.toFixed(5)).join(',')}`;

interface Entry {
  t: number;
  result: ImportResult;
}

/** Small best-effort localStorage cache for imports; never throws. */
export function getCached(b: Bounds): ImportResult | null {
  try {
    const raw = localStorage.getItem(keyFor(b));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry;
    if (Date.now() - entry.t > TTL_MS) {
      localStorage.removeItem(keyFor(b));
      return null;
    }
    return entry.result;
  } catch {
    return null;
  }
}

export function putCached(b: Bounds, result: ImportResult): void {
  try {
    const raw = JSON.stringify({ t: Date.now(), result } satisfies Entry);
    if (raw.length > MAX_BYTES) return;
    // Keep only the newest few entries.
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
    if (keys.length >= 5) keys.slice(0, keys.length - 4).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(keyFor(b), raw);
  } catch {
    /* quota or privacy mode: ignore */
  }
}
