import type { CityBlock, BlockStatus } from './CityBlockGrid';

interface SavedProgress {
  version: 1;
  updatedAt: number;
  statuses: Record<string, BlockStatus>;
}

const STORAGE_PREFIX = 'dhaka-world-builder:block-progress:v1:';

function keyFor(blocks: CityBlock[]): string {
  if (!blocks.length) return STORAGE_PREFIX + 'empty';
  const all = blocks.map((b) => b.bounds);
  const west = Math.min(...all.map((b) => b.west));
  const south = Math.min(...all.map((b) => b.south));
  const east = Math.max(...all.map((b) => b.east));
  const north = Math.max(...all.map((b) => b.north));
  return STORAGE_PREFIX + [west, south, east, north].map((n) => n.toFixed(6)).join(':');
}

/** Restore only known, valid statuses for the exact same geographic extent. */
export function loadBlockProgress(blocks: CityBlock[]): CityBlock[] {
  if (!blocks.length || typeof localStorage === 'undefined') return blocks;
  try {
    const raw = localStorage.getItem(keyFor(blocks));
    if (!raw) return blocks;
    const saved = JSON.parse(raw) as SavedProgress;
    if (saved.version !== 1 || !saved.statuses || typeof saved.statuses !== 'object') return blocks;
    const valid: BlockStatus[] = ['pending', 'generating', 'generated', 'validated', 'failed'];
    return blocks.map((block) => {
      const status = saved.statuses[block.id];
      return valid.includes(status) ? { ...block, status } : block;
    });
  } catch {
    return blocks;
  }
}

/** Persist the compact status manifest, never the potentially large OSM geometry. */
export function saveBlockProgress(blocks: CityBlock[]): void {
  if (!blocks.length || typeof localStorage === 'undefined') return;
  try {
    const statuses = Object.fromEntries(blocks.map((block) => [block.id, block.status]));
    const payload: SavedProgress = { version: 1, updatedAt: Date.now(), statuses };
    localStorage.setItem(keyFor(blocks), JSON.stringify(payload));
  } catch {
    // Storage can be disabled or full; generation must continue without it.
  }
}

export function summarizeBlockProgress(blocks: CityBlock[]) {
  const counts = { pending: 0, generating: 0, generated: 0, validated: 0, failed: 0 };
  for (const block of blocks) counts[block.status]++;
  const percent = blocks.length ? Math.round((counts.validated / blocks.length) * 100) : 0;
  return { ...counts, total: blocks.length, percent };
}
