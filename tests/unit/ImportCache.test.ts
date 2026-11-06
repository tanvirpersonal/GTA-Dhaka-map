import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, getCached, putCached } from '../../src/data/ImportCache';
import type { ImportResult } from '../../src/types/features';

const b = { west: 90.4, south: 23.76, east: 90.402, north: 23.762 };
const result: ImportResult = {
  features: [{ id: 'way/1', kind: 'road', tags: {}, points: [[90.4, 23.76]], highway: 'primary' }],
  counts: { building: 0, road: 1, path: 0, waterway: 0, water: 0, green: 0 },
  warnings: [],
};

beforeEach(async () => {
  await clearCache();
});
afterEach(() => vi.useRealTimers());

describe('ImportCache (IndexedDB)', () => {
  it('returns null on a miss', async () => {
    expect(await getCached(b)).toBeNull();
  });

  it('round-trips a tile', async () => {
    await putCached(b, result);
    expect(await getCached(b)).toEqual(result);
  });

  it('keeps tiles separate by bounds', async () => {
    await putCached(b, result);
    expect(await getCached({ ...b, east: 90.403 })).toBeNull();
  });

  it('expires entries after the TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    await putCached(b, result);
    vi.setSystemTime(new Date('2026-11-10T00:00:00Z')); // 9 days later
    expect(await getCached(b)).toBeNull();
  });

  it('clearCache removes everything', async () => {
    await putCached(b, result);
    await clearCache();
    expect(await getCached(b)).toBeNull();
  });
});
