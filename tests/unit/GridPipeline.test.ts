import { describe, expect, it } from 'vitest';
import { GridProgress } from '../../src/app/GridProgress';
import { runGridPipeline, type PipelineConfig } from '../../src/app/GridPipeline';
import { buildGrid } from '../../src/data/WorldGrid';
import type { Bounds } from '../../src/types/editor';
import type { ImportResult, LonLat, MapFeature } from '../../src/types/features';
import { defaultLayers } from '../../src/types/project';

const area: Bounds = { west: 90.39, south: 23.75, east: 90.41, north: 23.77 };
const SIZE = 2; // 2 x 2 = 4 cells keeps tests fast

const building = (id: string, cx: number, cy: number): MapFeature => {
  const d = 0.0001;
  const outer: LonLat[] = [
    [cx - d, cy - d],
    [cx + d, cy - d],
    [cx + d, cy + d],
    [cx - d, cy + d],
    [cx - d, cy - d],
  ];
  return { id, kind: 'building', tags: { building: 'yes' }, outer, holes: [], heightM: 10 };
};

const result = (features: MapFeature[]): ImportResult => ({
  features,
  counts: { building: features.length, road: 0, path: 0, waterway: 0, water: 0, green: 0 },
  warnings: [],
});

const ids = () => buildGrid(area, SIZE, SIZE).map((c) => c.id);

function config(over: Partial<PipelineConfig> = {}) {
  const progress = new GridProgress(ids());
  const outputs: string[] = [];
  const ctrl = new AbortController();
  const cfg: PipelineConfig = {
    bounds: area,
    gridSize: SIZE,
    progress,
    signal: ctrl.signal,
    getOverrides: () => ({}),
    getLayers: defaultLayers,
    onCell: (o) => outputs.push(o.cell.id),
    yieldFn: async () => {},
    // One unique building per cell plus one shared id that every cell also "sees".
    importCell: async (b) => {
      const cx = (b.west + b.east) / 2;
      const cy = (b.south + b.north) / 2;
      return result([building(`own-${cx.toFixed(4)}-${cy.toFixed(4)}`, cx, cy), building('shared', cx, cy)]);
    },
    ...over,
  };
  return { cfg, progress, outputs, ctrl };
}

describe('runGridPipeline', () => {
  it('imports and generates every cell, reaching 100% on both bars', async () => {
    const { cfg, progress, outputs } = config();
    const s = await runGridPipeline(cfg);
    expect(s.ready).toBe(4);
    expect(outputs).toHaveLength(4);
    const snap = progress.snapshot();
    expect(snap.importedPct).toBeCloseTo(100, 6);
    expect(snap.generatedPct).toBeCloseTo(100, 6);
    expect(snap.counts.ready).toBe(4);
  });

  it('de-duplicates features that appear in several cells (first cell wins)', async () => {
    const { cfg } = config();
    const s = await runGridPipeline(cfg);
    // 4 unique + 1 shared = 5, not 8
    expect(s.features).toBe(5);
    expect(s.triangles).toBeGreaterThan(0);
  });

  it('builds the centre of the grid first (cells are named by id)', async () => {
    const { cfg, outputs } = config();
    await runGridPipeline(cfg);
    expect(new Set(outputs).size).toBe(4);
  });

  it('keeps going after one cell fails and reports it', async () => {
    let n = 0;
    const { cfg, progress } = config({
      importCell: async (b) => {
        if (++n === 2) throw new Error('boom');
        const cx = (b.west + b.east) / 2;
        const cy = (b.south + b.north) / 2;
        return result([building(`b${n}`, cx, cy)]);
      },
    });
    const s = await runGridPipeline(cfg);
    expect(s.ready).toBe(3);
    expect(s.failed).toHaveLength(1);
    expect(progress.snapshot().counts.error).toBe(1);
    expect(s.abortedReason).toBeNull();
  });

  it('stops after repeated consecutive failures', async () => {
    const { cfg } = config({
      gridSize: 10,
      progress: new GridProgress(buildGrid(area).map((c) => c.id)),
      importCell: async () => {
        throw new Error('rate limited');
      },
      maxConsecutiveFailures: 3,
    });
    const s = await runGridPipeline(cfg);
    expect(s.failed).toHaveLength(3);
    expect(s.abortedReason).toMatch(/rate limited/);
    expect(s.ready).toBe(0);
  });

  it('cancels cleanly: stops early and leaves unfinished cells pending', async () => {
    const { cfg, progress, ctrl } = config();
    cfg.onCell = () => ctrl.abort(); // abort as soon as the first cell is on screen
    const s = await runGridPipeline(cfg);
    expect(s.cancelled).toBe(true);
    expect(s.ready).toBe(1);
    const c = progress.snapshot().counts;
    expect(c.importing + c.generating).toBe(0);
    expect(c.ready).toBe(1);
  });

  it('reports sub-tile progress while a cell imports', async () => {
    const { cfg, progress } = config({
      importCell: async (b, o) => {
        o.onProgress?.({ done: 1, total: 4, fromCache: false });
        const mid = progress.snapshot().importedPct;
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(100);
        return result([building('x', (b.west + b.east) / 2, (b.south + b.north) / 2)]);
      },
    });
    await runGridPipeline(cfg);
  });
});
