import type { Bounds } from '../types/editor';
import type { FeatureCounts, ImportResult, ImportWarning, MapFeature } from '../types/features';
import { getCached, putCached } from './ImportCache';
import { fetchOSM, type FetchOptions } from './OSMClient';
import { parseOverpass } from './OSMParser';
import { splitBounds } from './TileGrid';

const PAUSE_BETWEEN_TILES_MS = 1000;

export interface TiledProgress {
  done: number;
  total: number;
  fromCache: boolean;
}

export interface TiledOptions extends Pick<FetchOptions, 'signal' | 'onRetry'> {
  onProgress?: (p: TiledProgress) => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Import bounds as a sequence of small tiles (cached individually, polite pause between
 * network requests) and merge them. Features crossing tile edges are de-duplicated by id.
 */
export async function importTiled(bounds: Bounds, opts: TiledOptions = {}): Promise<ImportResult> {
  const tiles = splitBounds(bounds);
  const seen = new Set<string>();
  const features: MapFeature[] = [];
  const warnings = new Map<string, ImportWarning>();
  let needPause = false;

  for (let i = 0; i < tiles.length; i++) {
    throwIfAborted(opts.signal);
    const tile = tiles[i];
    let result = await getCached(tile);
    // IndexedDB reads cannot be cancelled, so check immediately after they settle as well.
    throwIfAborted(opts.signal);
    const fromCache = !!result;
    if (!result) {
      if (needPause) await sleep(PAUSE_BETWEEN_TILES_MS, opts.signal);
      throwIfAborted(opts.signal);
      const raw = await fetchOSM(tile, { signal: opts.signal, onRetry: opts.onRetry });
      throwIfAborted(opts.signal);
      result = parseOverpass(raw);
      await putCached(tile, result);
      throwIfAborted(opts.signal);
      needPause = true;
    }
    for (const f of result.features) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      features.push(f);
    }
    for (const w of result.warnings) {
      // An empty tile is normal when stitching; only the merged result decides "empty".
      if (w.code === 'empty' || w.code === 'no-buildings') continue;
      warnings.set(`${w.code}:${w.message}`, w);
    }
    opts.onProgress?.({ done: i + 1, total: tiles.length, fromCache });
  }

  throwIfAborted(opts.signal);
  const counts: FeatureCounts = { building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 };
  for (const f of features) counts[f.kind]++;
  if (features.length === 0) warnings.set('empty', { code: 'empty', message: 'No features found in this area.' });
  else if (counts.building === 0)
    warnings.set('no-buildings', {
      code: 'no-buildings',
      message: 'No buildings found; OSM coverage may be sparse here.',
    });
  if (tiles.length > 1) warnings.set('tiled', { code: 'tiled', message: `Imported as ${tiles.length} tiles.` });

  return { features, counts, warnings: [...warnings.values()] };
}
