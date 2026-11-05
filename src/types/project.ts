import type { Bounds } from './editor';
import type { ImportResult } from './features';

/** Per-feature user edits, applied on top of imported OSM data. */
export interface FeatureOverride {
  heightM?: number;
  widthM?: number;
  hidden?: boolean;
}
export type Overrides = Record<string, FeatureOverride>;

export const LAYER_IDS = ['buildings', 'roads', 'paths', 'waterways', 'water', 'green'] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export interface LayerSettings {
  visible: boolean;
  /** 0xRRGGBB. Buildings use this as a tint multiplied with per-building colour. */
  color: number;
}
export type Layers = Record<LayerId, LayerSettings>;

export const LAYER_LABELS: Record<LayerId, string> = {
  buildings: 'Buildings',
  roads: 'Roads',
  paths: 'Paths',
  waterways: 'Waterways',
  water: 'Water areas',
  green: 'Green areas',
};

const DEFAULT_COLORS: Record<LayerId, number> = {
  buildings: 0xffffff,
  roads: 0x3a3d44,
  paths: 0x8a8272,
  waterways: 0x2a5f8f,
  water: 0x2a5f8f,
  green: 0x2f5d3a,
};

export function defaultLayers(): Layers {
  const out = {} as Layers;
  for (const id of LAYER_IDS) out[id] = { visible: true, color: DEFAULT_COLORS[id] };
  return out;
}

export const PROJECT_FORMAT = 'dhaka-world-builder';

/** Editable project JSON (save / reopen). */
export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: 1;
  savedAt: string;
  bounds: Bounds;
  import: ImportResult;
  overrides: Overrides;
  layers: Layers;
}
