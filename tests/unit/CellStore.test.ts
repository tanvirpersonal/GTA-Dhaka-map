import { describe, expect, it } from 'vitest';
import { CellStore } from '../../src/app/CellStore';
import { buildGrid, partitionByCell } from '../../src/data/WorldGrid';
import type { ImportResult, LonLat, MapFeature } from '../../src/types/features';

const area = { west: 90.3, south: 23.65, east: 90.52, north: 23.92 };
const cells = buildGrid(area);

const b = (id: string, lon: number, lat: number): MapFeature => {
  const outer: LonLat[] = [
    [lon, lat],
    [lon + 0.0001, lat],
    [lon + 0.0001, lat + 0.0001],
    [lon, lat],
  ];
  return { id, kind: 'building', tags: {}, outer, holes: [] };
};
const road = (id: string, lon: number, lat: number): MapFeature => ({
  id,
  kind: 'road',
  tags: {},
  points: [
    [lon, lat],
    [lon + 0.001, lat],
  ],
  highway: 'primary',
});
const res = (features: MapFeature[]): ImportResult => ({
  features,
  counts: { building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 },
  warnings: [],
});

describe('CellStore', () => {
  it('tracks which cell owns a feature and finds it', () => {
    const s = new CellStore();
    s.set(cells[0], res([b('a', 90.301, 23.651)]));
    s.set(cells[1], res([b('b', 90.325, 23.651)]));
    expect(s.cellOfFeature('a')).toBe(cells[0].id);
    expect(s.cellOfFeature('b')).toBe(cells[1].id);
    expect(s.feature('b')?.id).toBe('b');
    expect(s.cellOfFeature('zzz')).toBeUndefined();
  });

  it('replacing a cell drops its old features', () => {
    const s = new CellStore();
    s.set(cells[0], res([b('a', 90.301, 23.651)]));
    s.set(cells[0], res([b('c', 90.302, 23.652)]));
    expect(s.feature('a')).toBeUndefined();
    expect(s.feature('c')).toBeDefined();
  });

  it('merges every cell with recomputed counts', () => {
    const s = new CellStore();
    s.set(cells[0], res([b('a', 90.301, 23.651), road('r', 90.301, 23.651)]));
    s.set(cells[1], res([b('b', 90.325, 23.651)]));
    const m = s.merged();
    expect(m.features).toHaveLength(3);
    expect(m.counts.building).toBe(2);
    expect(m.counts.road).toBe(1);
  });

  it('clear empties everything', () => {
    const s = new CellStore();
    s.set(cells[0], res([b('a', 90.301, 23.651)]));
    s.clear();
    expect(s.size).toBe(0);
    expect(s.feature('a')).toBeUndefined();
  });
});

describe('partitionByCell', () => {
  it('assigns buildings and lines to the cell holding their first point', () => {
    const p = partitionByCell(cells, [b('a', 90.301, 23.651), road('r', 90.5, 23.9), b('c', 90.301, 23.652)]);
    expect(p.get('r0c0')?.map((f) => f.id)).toEqual(['a', 'c']);
    expect(p.get('r9c9')?.map((f) => f.id)).toEqual(['r']);
  });

  it('snaps points outside the grid to the nearest cell instead of dropping them', () => {
    const p = partitionByCell(cells, [b('far', 91, 24)]);
    expect(p.get('r9c9')?.[0].id).toBe('far');
  });
});
