import type * as THREE from 'three';
import { LocalProjection } from '../data/CoordinateTransform';
import { importTiled, type TiledOptions } from '../data/TiledImport';
import { buildGrid, GRID_SIZE, orderCenterOut, type GridCell } from '../data/WorldGrid';
import { generateCityAsync } from '../generator/CityGenerator';
import type { Bounds } from '../types/editor';
import type { FeatureCounts, ImportResult } from '../types/features';
import type { Layers, Overrides } from '../types/project';
import type { GridProgress } from './GridProgress';

export interface CellOutput {
  cell: GridCell;
  result: ImportResult;
  group: THREE.Group;
  triangles: number;
}

export interface PipelineConfig {
  /** Whole area to build; split into gridSize x gridSize cells. */
  bounds: Bounds;
  progress: GridProgress;
  signal: AbortSignal;
  /** Cells per side. Defaults to 10 (100 cells). */
  gridSize?: number;
  getOverrides: () => Overrides;
  getLayers: () => Layers;
  /** Called as soon as a cell's 3D group is ready. The caller adds it to the scene and keeps the data. */
  onCell: (out: CellOutput) => void;
  onRetry?: TiledOptions['onRetry'];
  /** Consecutive failed cells before giving up (e.g. Overpass is blocking us). Default 3. */
  maxConsecutiveFailures?: number;
  /** Injectable for tests. */
  importCell?: (bounds: Bounds, opts: TiledOptions) => Promise<ImportResult>;
  /** Awaited between layers so the page can repaint. */
  yieldFn?: () => Promise<void>;
}

export interface PipelineSummary {
  ready: number;
  failed: string[];
  cancelled: boolean;
  /** Set when the run stopped early because of repeated failures. */
  abortedReason: string | null;
  features: number;
  triangles: number;
}

/** Wait for the next paint, but never stall in a background tab. */
export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });

function recount(features: ImportResult['features']): FeatureCounts {
  const c: FeatureCounts = { building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 };
  for (const f of features) c[f.kind]++;
  return c;
}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

/**
 * Import and generate a grid of cells at the same time: while cell N is being turned into 3D,
 * cell N+1 is already downloading. Cells are processed centre-out so the middle of the map appears first.
 */
export async function runGridPipeline(cfg: PipelineConfig): Promise<PipelineSummary> {
  const { progress, signal } = cfg;
  const size = cfg.gridSize ?? GRID_SIZE;
  const cells = orderCenterOut(buildGrid(cfg.bounds, size, size), size, size);
  const proj = LocalProjection.fromBounds(cfg.bounds); // one origin for the whole world, so cells line up
  const importCell = cfg.importCell ?? importTiled;
  const yieldFn = cfg.yieldFn ?? nextFrame;
  const maxFail = cfg.maxConsecutiveFailures ?? 3;

  // Features that straddle a cell edge show up in both cells' queries; first cell wins.
  const seen = new Set<string>();
  const queue: { cell: GridCell; result: ImportResult }[] = [];
  const failed: string[] = [];
  let importDone = false;
  let wake: (() => void) | null = null;
  let abortedReason: string | null = null;
  let features = 0;
  let triangles = 0;
  let ready = 0;

  const notify = () => {
    wake?.();
    wake = null;
  };

  const importer = (async () => {
    let consecutive = 0;
    try {
      for (const cell of cells) {
        if (signal.aborted) break;
        progress.setStatus(cell.id, 'importing');
        try {
          const raw = await importCell(cell.bounds, {
            signal,
            onRetry: cfg.onRetry,
            onProgress: (p) => progress.setImport(cell.id, p.done / p.total),
          });
          const fresh = raw.features.filter((f) => !seen.has(f.id));
          for (const f of fresh) seen.add(f.id);
          queue.push({ cell, result: { ...raw, features: fresh, counts: recount(fresh) } });
          progress.setStatus(cell.id, 'imported');
          consecutive = 0;
          notify();
        } catch (e) {
          if (isAbort(e) || signal.aborted) {
            progress.setStatus(cell.id, 'pending');
            break;
          }
          progress.setStatus(cell.id, 'error');
          failed.push(cell.id);
          if (++consecutive >= maxFail) {
            abortedReason = `Stopped after ${maxFail} failed cells in a row (${(e as Error).message}).`;
            break;
          }
        }
      }
    } finally {
      importDone = true;
      notify();
    }
  })();

  while (true) {
    const job = queue.shift();
    if (!job) {
      if (importDone) break;
      await new Promise<void>((r) => (wake = r));
      continue;
    }
    if (signal.aborted) {
      progress.setStatus(job.cell.id, 'pending');
      continue; // drain the queue without generating
    }
    const id = job.cell.id;
    progress.setStatus(id, 'generating');
    progress.setGenerate(id, 0);
    try {
      const { group, stats } = await generateCityAsync(
        job.result,
        job.cell.bounds,
        cfg.getOverrides(),
        cfg.getLayers(),
        {
          projection: proj,
          name: id,
          onStep: (f) => progress.setGenerate(id, f),
          yieldFn,
        },
      );
      cfg.onCell({ cell: job.cell, result: job.result, group, triangles: stats.triangles });
      progress.setStatus(id, 'ready');
      ready++;
      features += job.result.features.length;
      triangles += stats.triangles;
    } catch {
      progress.setStatus(id, 'error');
      failed.push(id);
    }
  }
  await importer;

  return { ready, failed, cancelled: signal.aborted, abortedReason, features, triangles };
}
