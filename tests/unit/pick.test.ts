import { describe, expect, it } from 'vitest';
import { featureAtFace, rangeOf, type PickMap } from '../../src/generator/pick';

// Three features: 12 verts (4 faces), 6 verts (2 faces), 3 verts (1 face).
const pick: PickMap = { ids: ['a', 'b', 'c'], starts: [0, 12, 18], total: 21 };

describe('pick map', () => {
  it('finds the feature owning a face', () => {
    expect(featureAtFace(pick, 0)).toBe('a');
    expect(featureAtFace(pick, 3)).toBe('a');
    expect(featureAtFace(pick, 4)).toBe('b');
    expect(featureAtFace(pick, 5)).toBe('b');
    expect(featureAtFace(pick, 6)).toBe('c');
  });

  it('returns null out of range', () => {
    expect(featureAtFace(pick, 7)).toBeNull();
    expect(featureAtFace({ ids: [], starts: [], total: 0 }, 0)).toBeNull();
  });

  it('gives vertex ranges by id', () => {
    expect(rangeOf(pick, 'a')).toEqual([0, 12]);
    expect(rangeOf(pick, 'c')).toEqual([18, 21]);
    expect(rangeOf(pick, 'zzz')).toBeNull();
  });
});
