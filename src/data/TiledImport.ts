import type { Bounds } from '../types/editor';
import type { FeatureCounts, ImportResult, ImportWarning, MapFeature } from '../types/features';
import { getCached, putCached } from './ImportCache';
import { fetchOSM, type FetchOptions } from './OSMClient';
import { parseOverpass } from './OSMParser';
import { splitBounds } from './TileGrid';
import { TEJGAON_CENTER } from '../map/DhakaBounds';

const PAUSE_BETWEEN_TILES_MS = 1000;

export interface TiledProgress {
  done: number;
  total: number;
  fromCache: boolean;
}

export interface TiledOptions extends Pick<FetchOptions, 'signal' | 'onRetry'> {
  onProgress?: (p: TiledProgress) => void;
  /** Called as soon as each tile is ready, with only newly seen features. */
  onTile?: (p: { tile: Bounds; features: MapFeature[]; done: number; total: number; fromCache: boolean }) => void | Promise<void>;
  /** Download nearby tiles first so a useful core city area is available early. */
  priorityCenter?: [number, number];
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

/**
 * Import bounds as a sequence of small tiles (cached individually, polite pause between
 * network requests) and merge them. Features crossing tile edges are de-duplicated by id.
 */
export async function importTiled(bounds: Bounds, opts: TiledOptions = {}): Promise<ImportResult> {
  const center = opts.priorityCenter ?? TEJGAON_CENTER;
  const tiles = splitBounds(bounds).sort((a, b) => {
    const ax = (a.west + a.east) / 2 - center[0];
    const ay = (a.south + a.north) / 2 - center[1];
    const bx = (b.west + b.east) / 2 - center[0];
    const by = (b.south + b.north) / 2 - center[1];
    return (ax * ax + ay * ay) - (bx * bx + by * by);
  });
  const seen = new Set<string>();
  const features: MapFeature[] = [];
  const warnings = new Map<string, ImportWarning>();
  let needPause = false;

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    let result = getCached(tile);
    const fromCache = !!result;
    if (!result) {
      if (needPause) await sleep(PAUSE_BETWEEN_TILES_MS, opts.signal);
      const raw = await fetchOSM(tile, { signal: opts.signal, onRetry: opts.onRetry });
      result = parseOverpass(raw);
      putCached(tile, result);
      needPause = true;
    }
    const tileFeatures: MapFeature[] = [];
    for (const f of result.features) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      features.push(f);
      tileFeatures.push(f);
    }
    await opts.onTile?.({ tile, features: tileFeatures, done: i + 1, total: tiles.length, fromCache });
    for (const w of result.warnings) {
      // An empty tile is normal when stitching; only the merged result decides "empty".
      if (w.code === 'empty' || w.code === 'no-buildings') continue;
      warnings.set(`${w.code}:${w.message}`, w);
    }
    opts.onProgress?.({ done: i + 1, total: tiles.length, fromCache });
  }

  const counts: FeatureCounts = { building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 };
  for (const f of features) counts[f.kind]++;
  if (features.length === 0) warnings.set('empty', { code: 'empty', message: 'No features found in this area.' });
  else if (counts.building === 0) warnings.set('no-buildings', { code: 'no-buildings', message: 'No buildings found; OSM coverage may be sparse here.' });
  if (tiles.length > 1) warnings.set('tiled', { code: 'tiled', message: `Imported as ${tiles.length} tiles.` });

  return { features, counts, warnings: [...warnings.values()] };
}
