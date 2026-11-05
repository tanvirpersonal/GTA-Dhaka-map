import type { Bounds } from '../types/editor';
import { boundsAreaKm2 } from '../map/DhakaBounds';

/** Largest area fetched in a single Overpass request. */
export const TILE_AREA_KM2 = 0.25;

/**
 * Split bounds into a grid of near-equal tiles, each <= maxTileKm2.
 * Tiles are returned row by row (south to north, west to east).
 */
export function splitBounds(b: Bounds, maxTileKm2 = TILE_AREA_KM2): Bounds[] {
  const area = boundsAreaKm2(b);
  if (area <= maxTileKm2) return [b];

  const n = Math.ceil(area / maxTileKm2);
  const aspect = (b.east - b.west) / (b.north - b.south || 1);
  const cols = Math.max(1, Math.round(Math.sqrt(n * aspect)));
  const rows = Math.max(1, Math.ceil(n / cols));

  const dx = (b.east - b.west) / cols;
  const dy = (b.north - b.south) / rows;
  const tiles: Bounds[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        west: b.west + c * dx,
        east: c === cols - 1 ? b.east : b.west + (c + 1) * dx,
        south: b.south + r * dy,
        north: r === rows - 1 ? b.north : b.south + (r + 1) * dy,
      });
    }
  }
  return tiles;
}
