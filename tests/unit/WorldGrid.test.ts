import { describe, expect, it } from 'vitest';
import { buildGrid, cellAt, orderCenterOut } from '../../src/data/WorldGrid';

const area = { west: 90.3, south: 23.65, east: 90.52, north: 23.92 };

describe('buildGrid', () => {
  const cells = buildGrid(area);

  it('makes 100 unique cells', () => {
    expect(cells).toHaveLength(100);
    expect(new Set(cells.map((c) => c.id)).size).toBe(100);
  });

  it('covers the bounds exactly', () => {
    expect(Math.min(...cells.map((c) => c.bounds.west))).toBe(area.west);
    expect(Math.max(...cells.map((c) => c.bounds.east))).toBe(area.east);
    expect(Math.min(...cells.map((c) => c.bounds.south))).toBe(area.south);
    expect(Math.max(...cells.map((c) => c.bounds.north))).toBe(area.north);
  });

  it('has equal-size neighbours that touch', () => {
    const a = cells[0].bounds;
    const b = cells[1].bounds;
    expect(b.west).toBeCloseTo(a.east, 12);
    expect(b.south).toBe(a.south);
  });
});

describe('orderCenterOut', () => {
  it('starts in the middle and ends at a corner', () => {
    const ordered = orderCenterOut(buildGrid(area));
    expect(ordered).toHaveLength(100);
    expect([4, 5]).toContain(ordered[0].row);
    expect([4, 5]).toContain(ordered[0].col);
    const last = ordered[99];
    expect([0, 9]).toContain(last.row);
    expect([0, 9]).toContain(last.col);
  });
});

describe('cellAt', () => {
  it('finds the containing cell and null outside', () => {
    const cells = buildGrid(area);
    const c = cellAt(cells, 90.301, 23.651);
    expect(c?.id).toBe('r0c0');
    expect(cellAt(cells, 91, 23.7)).toBeNull();
  });
});
