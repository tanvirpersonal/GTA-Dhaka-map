import { describe, expect, it } from 'vitest';
import { splitBounds } from '../../src/data/TileGrid';
import { boundsAreaKm2 } from '../../src/map/DhakaBounds';

const area = { west: 90.39, south: 23.75, east: 90.41, north: 23.77 };

describe('splitBounds', () => {
  it('returns the same bounds when already small', () => {
    const small = { west: 90.4, south: 23.76, east: 90.402, north: 23.762 };
    expect(splitBounds(small)).toEqual([small]);
  });

  it('keeps every tile within the max area', () => {
    for (const t of splitBounds(area, 0.25)) expect(boundsAreaKm2(t)).toBeLessThanOrEqual(0.25 * 1.01);
  });

  it('covers the whole area with no gaps or overlap', () => {
    const tiles = splitBounds(area, 0.25);
    const total = tiles.reduce((s, t) => s + boundsAreaKm2(t), 0);
    expect(total).toBeCloseTo(boundsAreaKm2(area), 3);
    expect(Math.min(...tiles.map((t) => t.west))).toBe(area.west);
    expect(Math.max(...tiles.map((t) => t.east))).toBe(area.east);
    expect(Math.min(...tiles.map((t) => t.south))).toBe(area.south);
    expect(Math.max(...tiles.map((t) => t.north))).toBe(area.north);
  });
});
