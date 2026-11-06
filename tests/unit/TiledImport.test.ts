import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportResult } from '../../src/types/features';

const mocks = vi.hoisted(() => ({
  getCached: vi.fn(),
  putCached: vi.fn(),
  fetchOSM: vi.fn(),
  parseOverpass: vi.fn(),
}));

vi.mock('../../src/data/ImportCache', () => ({
  getCached: mocks.getCached,
  putCached: mocks.putCached,
}));
vi.mock('../../src/data/OSMClient', () => ({ fetchOSM: mocks.fetchOSM }));
vi.mock('../../src/data/OSMParser', () => ({ parseOverpass: mocks.parseOverpass }));

import { importTiled } from '../../src/data/TiledImport';

const bounds = { west: 90.4, south: 23.76, east: 90.402, north: 23.762 };
const empty: ImportResult = {
  features: [],
  counts: { building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 },
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCached.mockResolvedValue(empty);
  mocks.putCached.mockResolvedValue(undefined);
});

describe('importTiled cancellation', () => {
  it('rejects when already aborted before the first cache lookup', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(importTiled(bounds, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(mocks.getCached).not.toHaveBeenCalled();
    expect(mocks.fetchOSM).not.toHaveBeenCalled();
  });

  it('checks cancellation after an IndexedDB cache read settles', async () => {
    const controller = new AbortController();
    mocks.getCached.mockImplementation(async () => {
      controller.abort();
      return empty;
    });
    const onProgress = vi.fn();

    await expect(importTiled(bounds, { signal: controller.signal, onProgress })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(onProgress).not.toHaveBeenCalled();
    expect(mocks.fetchOSM).not.toHaveBeenCalled();
  });
});
