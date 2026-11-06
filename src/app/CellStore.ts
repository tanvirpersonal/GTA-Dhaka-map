import type { GridCell } from '../data/WorldGrid';
import type { FeatureCounts, ImportResult, MapFeature } from '../types/features';

export interface CellRecord {
  cell: GridCell;
  result: ImportResult;
  byId: Map<string, MapFeature>;
}

/** Keeps the imported data of every generated cell, and which cell owns which feature. */
export class CellStore {
  private readonly cells = new Map<string, CellRecord>();
  private readonly owner = new Map<string, string>();

  get size(): number {
    return this.cells.size;
  }

  clear(): void {
    this.cells.clear();
    this.owner.clear();
  }

  /** Add or replace a cell's data. */
  set(cell: GridCell, result: ImportResult): void {
    const old = this.cells.get(cell.id);
    if (old) for (const id of old.byId.keys()) this.owner.delete(id);
    const byId = new Map(result.features.map((f) => [f.id, f]));
    for (const id of byId.keys()) this.owner.set(id, cell.id);
    this.cells.set(cell.id, { cell, result, byId });
  }

  get(cellId: string): CellRecord | undefined {
    return this.cells.get(cellId);
  }

  /** Id of the cell that owns a feature, if any. */
  cellOfFeature(featureId: string): string | undefined {
    return this.owner.get(featureId);
  }

  feature(featureId: string): MapFeature | undefined {
    const c = this.owner.get(featureId);
    return c ? this.cells.get(c)?.byId.get(featureId) : undefined;
  }

  all(): CellRecord[] {
    return [...this.cells.values()];
  }

  /** All cells' features as one import result (for saving and totals). */
  merged(): ImportResult {
    const features: MapFeature[] = [];
    const counts: FeatureCounts = { building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 };
    for (const rec of this.cells.values()) {
      for (const f of rec.result.features) {
        features.push(f);
        counts[f.kind]++;
      }
    }
    return { features, counts, warnings: [] };
  }
}
