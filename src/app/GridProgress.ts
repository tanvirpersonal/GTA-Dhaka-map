import { Emitter } from './events';

export type CellStatus = 'pending' | 'importing' | 'imported' | 'generating' | 'ready' | 'error';

export interface ProgressSnapshot {
  /** 0..100, share of all cells whose OSM data has been imported (partial cells count fractionally). */
  importedPct: number;
  /** 0..100, share of all cells whose 3D geometry has been generated. */
  generatedPct: number;
  counts: Record<CellStatus, number>;
  statuses: ReadonlyMap<string, CellStatus>;
}

interface ProgressEvents extends Record<string, unknown> {
  change: ProgressSnapshot;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Tracks per-cell import/generate state and turns it into two overall percentages. */
export class GridProgress extends Emitter<ProgressEvents> {
  private readonly status = new Map<string, CellStatus>();
  private readonly imp = new Map<string, number>();
  private readonly gen = new Map<string, number>();

  constructor(ids: readonly string[]) {
    super();
    for (const id of ids) this.status.set(id, 'pending');
  }

  /** Move a cell to a new status. Entering `imported` or `ready` completes that phase. */
  setStatus(id: string, s: CellStatus): void {
    if (!this.status.has(id)) return;
    this.status.set(id, s);
    if (s === 'imported' || s === 'generating' || s === 'ready') this.imp.set(id, 1);
    if (s === 'ready') this.gen.set(id, 1);
    this.emit('change', this.snapshot());
  }

  /** Partial import progress inside one cell (e.g. its sub-tiles), 0..1. */
  setImport(id: string, fraction: number): void {
    if (!this.status.has(id)) return;
    this.imp.set(id, clamp01(fraction));
    this.emit('change', this.snapshot());
  }

  /** Partial generation progress inside one cell (e.g. layers built), 0..1. */
  setGenerate(id: string, fraction: number): void {
    if (!this.status.has(id)) return;
    this.gen.set(id, clamp01(fraction));
    this.emit('change', this.snapshot());
  }

  snapshot(): ProgressSnapshot {
    const total = this.status.size || 1;
    const counts: Record<CellStatus, number> = {
      pending: 0,
      importing: 0,
      imported: 0,
      generating: 0,
      ready: 0,
      error: 0,
    };
    let imp = 0;
    let gen = 0;
    for (const [id, s] of this.status) {
      counts[s]++;
      if (s === 'error') continue;
      imp += this.imp.get(id) ?? 0;
      gen += this.gen.get(id) ?? 0;
    }
    return {
      importedPct: (imp / total) * 100,
      generatedPct: (gen / total) * 100,
      counts,
      statuses: this.status,
    };
  }
}
