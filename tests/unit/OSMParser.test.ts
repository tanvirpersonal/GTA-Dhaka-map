import { describe, expect, it } from 'vitest';
import { parseMeters, parseOverpass } from '../../src/data/OSMParser';
import type { OverpassElement } from '../../src/data/OSMClient';

const g = (lon: number, lat: number) => ({ lon, lat });
const sq = (x: number, y: number, s: number) => [g(x, y), g(x + s, y), g(x + s, y + s), g(x, y + s), g(x, y)];
const way = (id: number, tags: Record<string, string>, geometry: ReturnType<typeof sq>): OverpassElement => ({
  type: 'way',
  id,
  tags,
  geometry,
});

describe('parseMeters', () => {
  it('parses metres, feet and rejects junk', () => {
    expect(parseMeters('12')).toBe(12);
    expect(parseMeters('12 m')).toBe(12);
    expect(parseMeters('10 ft')).toBeCloseTo(3.048, 3);
    expect(parseMeters('tall')).toBeUndefined();
    expect(parseMeters('-5')).toBeUndefined();
    expect(parseMeters(undefined)).toBeUndefined();
  });
});

describe('parseOverpass', () => {
  it('classifies features and counts them', () => {
    const r = parseOverpass({
      elements: [
        way(1, { building: 'yes', 'building:levels': '4' }, sq(90.4, 23.76, 0.0002)),
        way(2, { highway: 'primary', lanes: '4' }, [g(90.4, 23.76), g(90.401, 23.761)]),
        way(3, { highway: 'footway' }, [g(90.4, 23.76), g(90.4005, 23.7605)]),
        way(4, { waterway: 'canal' }, [g(90.4, 23.76), g(90.402, 23.762)]),
        way(5, { natural: 'water' }, sq(90.4, 23.76, 0.0003)),
        way(6, { leisure: 'park' }, sq(90.4, 23.76, 0.0003)),
      ],
    });
    expect(r.counts).toEqual({ building: 1, road: 1, path: 1, waterway: 1, water: 1, green: 1 });
    const b = r.features.find((f) => f.kind === 'building');
    expect(b && 'levels' in b ? b.levels : 0).toBe(4);
  });

  it('skips unclosed areas with a warning', () => {
    const r = parseOverpass({
      elements: [way(1, { building: 'yes' }, [g(90.4, 23.76), g(90.401, 23.76), g(90.401, 23.761)])],
    });
    expect(r.counts.building).toBe(0);
    expect(r.warnings.some((w) => w.code === 'open-ring')).toBe(true);
  });

  it('assigns multipolygon holes to the outer ring that contains them', () => {
    const r = parseOverpass({
      elements: [
        {
          type: 'relation',
          id: 9,
          tags: { building: 'yes', type: 'multipolygon' },
          members: [
            { type: 'way', ref: 1, role: 'outer', geometry: sq(90.4, 23.76, 0.001) },
            { type: 'way', ref: 2, role: 'inner', geometry: sq(90.4003, 23.7603, 0.0002) },
          ],
        },
      ],
    });
    const b = r.features[0];
    expect(r.counts.building).toBe(1);
    expect(b.kind === 'building' && b.holes.length).toBe(1);
  });


  it('stitches fragmented outer member ways regardless of order and direction', () => {
    const a = g(90.4, 23.76);
    const b = g(90.401, 23.76);
    const c = g(90.401, 23.761);
    const d = g(90.4, 23.761);
    const r = parseOverpass({
      elements: [{
        type: 'relation',
        id: 10,
        tags: { building: 'yes', type: 'multipolygon' },
        members: [
          { type: 'way', ref: 3, role: 'outer', geometry: [c, b] },
          { type: 'way', ref: 1, role: 'outer', geometry: [a, b] },
          { type: 'way', ref: 4, role: 'outer', geometry: [d, a] },
          { type: 'way', ref: 2, role: 'outer', geometry: [c, d] },
        ],
      }],
    });

    expect(r.counts.building).toBe(1);
    const feature = r.features[0];
    expect(feature.kind).toBe('building');
    if (feature.kind === 'building') {
      expect(feature.outer[0]).toEqual(feature.outer[feature.outer.length - 1]);
      expect(feature.outer).toHaveLength(5);
    }
    expect(r.warnings.some((warning) => warning.code === 'open-ring')).toBe(false);
  });

  it('stitches fragmented inner member ways into a courtyard hole', () => {
    const outer = sq(90.4, 23.76, 0.002);
    const a = g(90.4005, 23.7605);
    const b = g(90.401, 23.7605);
    const c = g(90.401, 23.761);
    const d = g(90.4005, 23.761);
    const r = parseOverpass({
      elements: [{
        type: 'relation',
        id: 11,
        tags: { building: 'yes', type: 'multipolygon' },
        members: [
          { type: 'way', ref: 1, role: 'outer', geometry: outer },
          { type: 'way', ref: 2, role: 'inner', geometry: [a, b] },
          { type: 'way', ref: 3, role: 'inner', geometry: [c, b] },
          { type: 'way', ref: 4, role: 'inner', geometry: [d, c] },
          { type: 'way', ref: 5, role: 'inner', geometry: [a, d] },
        ],
      }],
    });

    const feature = r.features[0];
    expect(r.counts.building).toBe(1);
    expect(feature.kind === 'building' ? feature.holes : []).toHaveLength(1);
  });

  it('keeps multiple outer rings as separate features and associates holes', () => {
    const r = parseOverpass({
      elements: [{
        type: 'relation',
        id: 12,
        tags: { natural: 'water', type: 'multipolygon' },
        members: [
          { type: 'way', ref: 1, role: 'outer', geometry: sq(90.4, 23.76, 0.001) },
          { type: 'way', ref: 2, role: 'outer', geometry: sq(90.402, 23.76, 0.001) },
          { type: 'way', ref: 3, role: 'inner', geometry: sq(90.4002, 23.7602, 0.0002) },
        ],
      }],
    });

    expect(r.counts.water).toBe(2);
    expect(r.features.filter((feature) => feature.kind === 'water')).toHaveLength(2);
    expect(r.features.some((feature) => feature.kind === 'water' && feature.holes.length === 1)).toBe(true);
  });

  it('reports incomplete fragmented relation rings instead of emitting invalid polygons', () => {
    const r = parseOverpass({
      elements: [{
        type: 'relation',
        id: 13,
        tags: { building: 'yes', type: 'multipolygon' },
        members: [
          { type: 'way', ref: 1, role: 'outer', geometry: [g(90.4, 23.76), g(90.401, 23.76)] },
          { type: 'way', ref: 2, role: 'outer', geometry: [g(90.401, 23.76), g(90.401, 23.761)] },
        ],
      }],
    });

    expect(r.counts.building).toBe(0);
    expect(r.warnings.some((warning) => warning.code === 'open-ring')).toBe(true);
  });

  it('warns on empty results and passes through the Overpass remark', () => {
    const r = parseOverpass({ elements: [], remark: 'runtime error: timeout' });
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['remark', 'empty']));
  });

  it('ignores areas flagged highway=*, area=yes and construction roads', () => {
    const r = parseOverpass({
      elements: [
        way(1, { highway: 'pedestrian', area: 'yes' }, sq(90.4, 23.76, 0.0002)),
        way(2, { highway: 'construction' }, [g(90.4, 23.76), g(90.401, 23.761)]),
      ],
    });
    expect(r.features).toHaveLength(0);
  });
});
