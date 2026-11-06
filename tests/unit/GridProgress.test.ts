import { describe, expect, it } from 'vitest';
import { GridProgress } from '../../src/app/GridProgress';

const ids = Array.from({ length: 100 }, (_, i) => `c${i}`);

describe('GridProgress', () => {
  it('starts at 0% with everything pending', () => {
    const s = new GridProgress(ids).snapshot();
    expect(s.importedPct).toBe(0);
    expect(s.generatedPct).toBe(0);
    expect(s.counts.pending).toBe(100);
  });

  it('counts a fully imported cell as 1%, and a half-imported one as 0.5%', () => {
    const p = new GridProgress(ids);
    p.setStatus('c0', 'imported');
    p.setImport('c1', 0.5);
    expect(p.snapshot().importedPct).toBeCloseTo(1.5, 6);
    expect(p.snapshot().generatedPct).toBe(0);
  });

  it('marks both phases complete when a cell is ready', () => {
    const p = new GridProgress(ids);
    p.setStatus('c3', 'ready');
    const s = p.snapshot();
    expect(s.importedPct).toBeCloseTo(1, 6);
    expect(s.generatedPct).toBeCloseTo(1, 6);
    expect(s.counts.ready).toBe(1);
  });

  it('reaches 100% when all cells are ready', () => {
    const p = new GridProgress(ids);
    for (const id of ids) p.setStatus(id, 'ready');
    expect(p.snapshot().importedPct).toBeCloseTo(100, 6);
    expect(p.snapshot().generatedPct).toBeCloseTo(100, 6);
  });

  it('excludes errored cells from progress and clamps fractions', () => {
    const p = new GridProgress(ids);
    p.setImport('c5', 5);
    expect(p.snapshot().importedPct).toBeCloseTo(1, 6);
    p.setStatus('c5', 'error');
    expect(p.snapshot().importedPct).toBe(0);
    expect(p.snapshot().counts.error).toBe(1);
  });

  it('emits change events and ignores unknown ids', () => {
    const p = new GridProgress(ids);
    let n = 0;
    p.on('change', () => n++);
    p.setStatus('c1', 'importing');
    p.setStatus('nope', 'ready');
    expect(n).toBe(1);
  });
});
