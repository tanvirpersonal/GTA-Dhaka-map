import type { Bounds } from '../types/editor';
import { boundsAreaKm2 } from '../map/DhakaBounds';
import { TILE_AREA_KM2 } from './TileGrid';

/** The world is always split into GRID_SIZE x GRID_SIZE cells (10 x 10 = 100). */
export const GRID_SIZE = 10;

export interface GridCell {
  /** Stable id, e.g. "r3c7". */
  id: string;
  row: number;
  col: number;
  /** Row-major index 0..cols*rows-1. */
  index: number;
  bounds: Bounds;
}

/** Split bounds into cols x rows cells covering it exactly. Row 0 is the southern row. */
export function buildGrid(b: Bounds, cols = GRID_SIZE, rows = GRID_SIZE): GridCell[] {
  const dx = (b.east - b.west) / cols;
  const dy = (b.north - b.south) / rows;
  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        id: `r${row}c${col}`,
        row,
        col,
        index: row * cols + col,
        bounds: {
          west: b.west + col * dx,
          east: col === cols - 1 ? b.east : b.west + (col + 1) * dx,
          south: b.south + row * dy,
          north: row === rows - 1 ? b.north : b.south + (row + 1) * dy,
        },
      });
    }
  }
  return cells;
}

/** Order cells from the grid centre outwards, so the middle of the map appears first. */
export function orderCenterOut(cells: GridCell[], cols = GRID_SIZE, rows = GRID_SIZE): GridCell[] {
  const cc = (cols - 1) / 2;
  const cr = (rows - 1) / 2;
  return [...cells].sort((a, b) => {
    const da = Math.hypot(a.col - cc, a.row - cr);
    const db = Math.hypot(b.col - cc, b.row - cr);
    return da - db || a.index - b.index;
  });
}

/** The cell that contains a point, or null if outside the grid bounds. */
export function cellAt(cells: GridCell[], lon: number, lat: number): GridCell | null {
  return (
    cells.find((c) => lon >= c.bounds.west && lon <= c.bounds.east && lat >= c.bounds.south && lat <= c.bounds.north) ??
    null
  );
}

export interface BuildEstimate {
  /** Number of Overpass requests (each at most TILE_AREA_KM2). */
  tiles: number;
  /** Rough wall-clock minutes at ~2.5 s per uncached request. */
  minutes: number;
}

/** Rough cost of building `bounds` as a gridSize x gridSize grid, each cell split into small tiles. */
export function estimateBuild(bounds: Bounds, gridSize = GRID_SIZE): BuildEstimate {
  const cellKm2 = boundsAreaKm2(bounds) / (gridSize * gridSize);
  const tiles = gridSize * gridSize * Math.max(1, Math.ceil(cellKm2 / TILE_AREA_KM2));
  return { tiles, minutes: Math.ceil((tiles * 2.5) / 60) };
}
