import { describe, expect, it } from 'vitest';
import { LocalProjection } from '../../src/data/CoordinateTransform';

describe('LocalProjection', () => {
  const b = { west: 90.39, south: 23.75, east: 90.41, north: 23.77 };
  const proj = LocalProjection.fromBounds(b);

  it('maps the centre to the origin', () => {
    const [e, n] = proj.toLocal([90.4, 23.76]);
    expect(e).toBeCloseTo(0, 6);
    expect(n).toBeCloseTo(0, 6);
  });

  it('puts east at +x and north at +y in metres', () => {
    const [e] = proj.toLocal([90.401, 23.76]);
    const [, n] = proj.toLocal([90.4, 23.761]);
    expect(e).toBeGreaterThan(90); // 0.001 deg lon ~ 102 m at this latitude
    expect(e).toBeLessThan(115);
    expect(n).toBeGreaterThan(105); // 0.001 deg lat ~ 110.6 m
    expect(n).toBeLessThan(116);
  });

  it('round-trips', () => {
    const p: [number, number] = [90.4051, 23.7633];
    const back = proj.toLonLat(proj.toLocal(p));
    expect(back[0]).toBeCloseTo(p[0], 9);
    expect(back[1]).toBeCloseTo(p[1], 9);
  });
});
