import type { Bounds } from '../types/editor';
import { buildOverpassQuery } from './OSMQueryBuilder';

/**
 * Public Overpass instances, ordered from the main FOSSGIS instance to
 * independent mirrors. If one instance is at capacity, the importer moves on.
 * Keep this list short and retain the tile pause in TiledImport.ts.
 */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
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
  /** Per-instance request timeout in milliseconds. */
  timeoutMs?: number;
  /** Called before each retry or mirror switch so the UI can show progress. */
  onRetry?: (info: { attempt: number; reason: string; delayMs: number }) => void;
  endpoints?: string[];
}

export class OSMImportError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
    this.name = 'OSMImportError';
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });

const RETRYABLE = new Set([408, 429, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_BACKOFF_MS = 8_000;

/**
 * Fetch OSM data with bounded requests, exponential backoff and mirror fallback.
 * Each mirror is tried before the first mirror is retried, avoiding repeated
 * pressure on an instance that has already returned a capacity error.
 */
export async function fetchOSM(bounds: Bounds, opts: FetchOptions = {}): Promise<OverpassResponse> {
  const {
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onRetry,
    endpoints = OVERPASS_ENDPOINTS,
  } = opts;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!endpoints.length) throw new OSMImportError('No Overpass API endpoints are configured.');

  const query = buildOverpassQuery(bounds);
  const maxAttempts = Math.max(1, opts.maxAttempts ?? endpoints.length + 1);
  let lastReason = 'unknown error';
  let lastEndpoint = endpoints[0];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const url = endpoints[(attempt - 1) % endpoints.length];
    lastEndpoint = url;
    let retryAfterMs = 0;
    let timedOut = false;
    const controller = new AbortController();
    const abortExternal = () => controller.abort();
    signal?.addEventListener('abort', abortExternal, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });
      if (res.ok) {
        const json = (await res.json()) as OverpassResponse;
        if (!Array.isArray(json.elements)) {
          throw new OSMImportError('Unexpected response from Overpass.');
        }
        return json;
      }

      lastReason = `HTTP ${res.status} from ${new URL(url).host}`;
      if (!RETRYABLE.has(res.status)) {
        throw new OSMImportError(`Overpass request failed (${lastReason}).`);
      }
      const retryAfter = Number(res.headers.get('Retry-After'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) retryAfterMs = retryAfter * 1000;
    } catch (err) {
      if (signal?.aborted || (err as Error).name === 'AbortError' && !timedOut) {
        throw new DOMException('Aborted', 'AbortError');
      }
      if (err instanceof OSMImportError && !err.retryable) throw err;
      lastReason = timedOut ? `timeout after ${timeoutMs / 1000}s at ${new URL(url).host}` : `network error at ${new URL(url).host}`;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortExternal);
    }

    if (attempt === maxAttempts) break;
    const backoffMs = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    const delayMs = Math.max(retryAfterMs, backoffMs);
    onRetry?.({ attempt, reason: lastReason, delayMs });
    await sleep(delayMs, signal);
  }

  throw new OSMImportError(
    `OSM import failed after ${maxAttempts} attempts. Last endpoint: ${lastEndpoint}. ${lastReason}. Try again later if all public instances are busy.`,
    true,
  );
}
