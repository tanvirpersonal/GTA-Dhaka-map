import type { Bounds } from '../types/editor';
import type { MapFeature } from '../types/features';
import { boundsSizeMeters } from '../map/DhakaBounds';

export const CITY_BLOCK_SIZE_M = 250;

export type BlockStatus = 'pending' | 'generating' | 'generated' | 'validated' | 'failed';

export interface CityBlock {
  id: string;
  row: number;
  column: number;
  bounds: Bounds;
  widthM: number;
  heightM: number;
  status: BlockStatus;
  featureIds: string[];
  counts: { building: number; road: number; path: number; waterway: number; water: number; green: number };
}

const emptyCounts = () => ({ building: 0, road: 0, path: 0, waterway: 0, water: 0, green: 0 });

/**
 * Split a geographic selection into approximately square metric blocks.
 * Edge blocks are clipped to the requested bounds. IDs are stable for the
 * same bounds and grid size, and rows are ordered south-to-north.
 */
export function createCityBlocks(bounds: Bounds, blockSizeM = CITY_BLOCK_SIZE_M): CityBlock[] {
  if (!Number.isFinite(blockSizeM) || blockSizeM < 25) {
    throw new Error('Block size must be a finite value of at least 25 metres.');
  }

  const { width, height } = boundsSizeMeters(bounds);
  const columns = Math.max(1, Math.ceil(width / blockSizeM));
  const rows = Math.max(1, Math.ceil(height / blockSizeM));
  const lonStep = (bounds.east - bounds.west) / columns;
  const latStep = (bounds.north - bounds.south) / rows;
  const blocks: CityBlock[] = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const blockBounds: Bounds = {
        west: bounds.west + column * lonStep,
        east: column === columns - 1 ? bounds.east : bounds.west + (column + 1) * lonStep,
        south: bounds.south + row * latStep,
        north: row === rows - 1 ? bounds.north : bounds.south + (row + 1) * latStep,
      };
      const size = boundsSizeMeters(blockBounds);
      blocks.push({
        id: `B-${String(row + 1).padStart(3, '0')}-${String(column + 1).padStart(3, '0')}`,
        row,
        column,
        bounds: blockBounds,
        widthM: size.width,
        heightM: size.height,
        status: 'pending',
        featureIds: [],
        counts: emptyCounts(),
      });
    }
  }
  return blocks;
}

function featureCenter(feature: MapFeature): [number, number] {
  const points = feature.kind === 'road' || feature.kind === 'path' || feature.kind === 'waterway'
    ? feature.points
    : feature.kind === 'building' || feature.kind === 'water' || feature.kind === 'green'
      ? feature.outer
      : [];
  let lon = 0;
  let lat = 0;
  for (const point of points) { lon += point[0]; lat += point[1]; }
  return [lon / points.length, lat / points.length];
}

/** Assign each imported OSM feature to the block containing its geometry centre. */
export function assignFeaturesToBlocks(blocks: CityBlock[], features: MapFeature[]): CityBlock[] {
  const result = blocks.map((block) => ({ ...block, featureIds: [] as string[], counts: emptyCounts() }));
  for (const feature of features) {
    const [lon, lat] = featureCenter(feature);
    const block = result.find((candidate) =>
      lon >= candidate.bounds.west && lon <= candidate.bounds.east &&
      lat >= candidate.bounds.south && lat <= candidate.bounds.north,
    );
    if (!block) continue;
    block.featureIds.push(feature.id);
    block.counts[feature.kind]++;
  }
  return result;
}

/** Return a serializable manifest suitable for saving and later AI block jobs. */
export function createBlockManifest(blocks: CityBlock[]) {
  return {
    schemaVersion: 1,
    blockSizeM: CITY_BLOCK_SIZE_M,
    totalBlocks: blocks.length,
    statusCounts: blocks.reduce((acc, block) => {
      acc[block.status] = (acc[block.status] ?? 0) + 1;
      return acc;
    }, {} as Partial<Record<BlockStatus, number>>),
    blocks,
  };
}
