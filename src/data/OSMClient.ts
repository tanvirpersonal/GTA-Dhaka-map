import type { Bounds } from '../types/editor';
import { buildOverpassQuery } from './OSMQueryBuilder';

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Subset of the Overpass JSON response we rely on. */
export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: {
    type: string;
    ref: number;
    role: string;
    geometry?: { lat: number; lon: number }[];
  }[];
}

export interface OverpassResponse {
  elements: OverpassElement[];
  remark?: string;
}

export interface FetchOptions {
  signal?: AbortSignal;
  maxAttempts?: number;
  /** Called before each retry so the UI can show progress. */
  onRetry?: (info: { attempt: number; reason: string; delayMs: number }) => void;
  endpoints?: string[];
}

export class OSMImportError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'OSMImportError';
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

const RETRYABLE = new Set([429, 502, 503, 504]);

/** Fetch OSM data for bounds with retry, backoff and mirror fallback. */
export async function fetchOSM(bounds: Bounds, opts: FetchOptions = {}): Promise<OverpassResponse> {
  const { signal, maxAttempts = 4, onRetry, endpoints = OVERPASS_ENDPOINTS } = opts;
  const body = new URLSearchParams({ data: buildOverpassQuery(bounds) });
  let lastReason = 'unknown error';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = endpoints[(attempt - 1) % endpoints.length];
    let retryAfterMs = 0;
    try {
      const res = await fetch(url, { method: 'POST', body, signal });
      if (res.ok) {
        const json = (await res.json()) as OverpassResponse;
        if (!Array.isArray(json.elements)) throw new OSMImportError('Unexpected response from Overpass.');
        return json;
      }
      lastReason = `HTTP ${res.status}`;
      if (!RETRYABLE.has(res.status)) throw new OSMImportError(`Overpass request failed (${lastReason}).`);
      const ra = Number(res.headers.get('Retry-After'));
      if (Number.isFinite(ra) && ra > 0) retryAfterMs = ra * 1000;
    } catch (err) {
      if (err instanceof OSMImportError && !err.retryable) throw err;
      if ((err as Error).name === 'AbortError') throw err;
      if (!(err instanceof OSMImportError)) lastReason = 'network error';
    }

    if (attempt === maxAttempts) break;
    const delayMs = Math.max(retryAfterMs, 1000 * 2 ** (attempt - 1));
    onRetry?.({ attempt, reason: lastReason, delayMs });
    await sleep(delayMs, signal);
  }
  throw new OSMImportError(`OSM import failed after ${maxAttempts} attempts (${lastReason}).`, true);
}
