/** Longitude/latitude pair in WGS84 degrees. */
export type LonLat = [lon: number, lat: number];

export type FeatureKind = 'building' | 'road' | 'path' | 'water' | 'green';

interface BaseFeature {
  /** OSM element id, prefixed by type (e.g. "way/123"). */
  id: string;
  kind: FeatureKind;
  /** Raw OSM tags, kept for later styling and export metadata. */
  tags: Record<string, string>;
}

export interface BuildingFeature extends BaseFeature {
  kind: 'building';
  /** Closed outer ring (first point equals last). */
  outer: LonLat[];
  /** Inner rings (courtyards). */
  holes: LonLat[][];
  /** Height in metres, if known from tags. */
  heightM?: number;
  levels?: number;
}

export interface LineFeature extends BaseFeature {
  kind: 'road' | 'path';
  points: LonLat[];
  /** OSM highway value, e.g. "primary", "footway". */
  highway: string;
  widthM?: number;
  lanes?: number;
  oneway?: boolean;
}

export interface AreaFeature extends BaseFeature {
  kind: 'water' | 'green';
  outer: LonLat[];
  holes: LonLat[][];
}

export type MapFeature = BuildingFeature | LineFeature | AreaFeature;

export interface ImportWarning {
  code: string;
  message: string;
}

export interface FeatureCounts {
  building: number;
  road: number;
  path: number;
  water: number;
  green: number;
}

export interface ImportResult {
  features: MapFeature[];
  counts: FeatureCounts;
  warnings: ImportWarning[];
}
