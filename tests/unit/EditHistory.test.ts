import { describe, expect, it } from 'vitest';
import { changedIds, EditHistory } from '../../src/editor/EditHistory';

describe('EditHistory', () => {
  it('undoes and redoes patches', () => {
    const h = new EditHistory();
    h.patch('a', { heightM: 10 });
    h.patch('a', { heightM: 20 });
    expect(h.current.a.heightM).toBe(20);
    expect(h.undo()?.a.heightM).toBe(10);
    expect(h.undo()).toEqual({});
    expect(h.undo()).toBeNull();
    expect(h.redo()?.a.heightM).toBe(10);
    expect(h.canRedo).toBe(true);
  });

  it('clears redo after a new edit', () => {
    const h = new EditHistory();
    h.patch('a', { heightM: 10 });
    h.undo();
    h.patch('b', { hidden: true });
    expect(h.canRedo).toBe(false);
  });

  it('removes an override when patched with null or empty, and does not mutate old snapshots', () => {
    const h = new EditHistory();
    h.patch('a', { heightM: 10 });
    const snap = h.current;
    h.patch('a', null);
    expect(h.current).toEqual({});
    expect(snap.a.heightM).toBe(10);
  });

  it('reset clears history', () => {
    const h = new EditHistory();
    h.patch('a', { heightM: 10 });
    h.reset({ z: { hidden: true } });
    expect(h.canUndo).toBe(false);
    expect(h.current).toEqual({ z: { hidden: true } });
  });
});

describe('changedIds', () => {
  it('lists added, removed and changed overrides only', () => {
    const a = { x: { heightM: 10 }, y: { hidden: true }, z: { widthM: 3 } };
    const b = { x: { heightM: 12 }, z: { widthM: 3 }, w: { hidden: true } };
    expect(changedIds(a, b).sort()).toEqual(['w', 'x', 'y']);
    expect(changedIds(a, a)).toEqual([]);
  });
});
