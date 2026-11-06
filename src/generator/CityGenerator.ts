import * as THREE from 'three';
import { LocalProjection } from '../data/CoordinateTransform';
import type { Bounds } from '../types/editor';
import type { AreaFeature, BuildingFeature, ImportResult, LineFeature } from '../types/features';
import { defaultLayers, type Layers, type Overrides } from '../types/project';
import { generateAreas } from './AreaGenerator';
import { generateBuildings } from './BuildingGenerator';
import { generateLines } from './RoadGenerator';

export interface CityStats {
  triangles: number;
  meshes: number;
  widthM: number;
  heightM: number;
}

export interface GeneratedCity {
  group: THREE.Group;
  stats: CityStats;
}

export interface GenerateOptions {
  /** Projection shared by all cells of a grid so they align. Defaults to one centred on `bounds`. */
  projection?: LocalProjection;
  /** Name of the returned group, e.g. a grid cell id. */
  name?: string;
}

export interface AsyncGenerateOptions extends GenerateOptions {
  /** Called after each layer is built with the finished fraction (0..1). */
  onStep?: (fraction: number) => void;
  /** Awaited between layers so the browser can repaint and stay responsive. */
  yieldFn?: () => Promise<void>;
}

type Part = () => THREE.Mesh | null;

/** One thunk per layer, in draw order. */
function planParts(result: ImportResult, proj: LocalProjection, overrides: Overrides, layers: Layers): Part[] {
  const pick = <T extends { kind: string }>(kind: string) =>
    result.features.filter((f) => f.kind === kind) as unknown as T[];
  const lines = (k: 'road' | 'path' | 'waterway') => pick<LineFeature>(k);
  return [
    () => generateAreas(pick<AreaFeature>('green'), proj, { name: 'green', color: layers.green.color, y: 0.01 }),
    () => generateAreas(pick<AreaFeature>('water'), proj, { name: 'water', color: layers.water.color, y: 0.02 }),
    () =>
      generateLines(lines('waterway'), proj, { name: 'waterways', color: layers.waterways.color, y: 0.03 }, overrides),
    () => generateLines(lines('road'), proj, { name: 'roads', color: layers.roads.color, y: 0.06 }, overrides),
    () => generateLines(lines('path'), proj, { name: 'paths', color: layers.paths.color, y: 0.09 }, overrides),
    () => generateBuildings(pick<BuildingFeature>('building'), proj, overrides),
  ];
}

/** Add built meshes to the group, apply layer settings and compute stats. */
function assemble(name: string, built: (THREE.Mesh | null)[], layers: Layers): GeneratedCity {
  const group = new THREE.Group();
  group.name = name;
  let triangles = 0;
  let meshes = 0;
  for (const m of built) {
    if (!m) continue;
    const layer = layers[m.name as keyof Layers];
    if (layer) {
      m.visible = layer.visible;
      // Buildings carry per-vertex colour; the layer colour tints it.
      if (m.name === 'buildings') (m.material as THREE.MeshStandardMaterial).color.setHex(layer.color);
    }
    group.add(m);
    meshes++;
    const g = m.geometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  }
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  return { group, stats: { triangles: Math.round(triangles), meshes, widthM: size.x, heightM: size.y } };
}

/** Turn imported features into a 3D city group in local metres (Y up, origin at selection centre). */
export function generateCity(
  result: ImportResult,
  bounds: Bounds,
  overrides: Overrides = {},
  layers: Layers = defaultLayers(),
  opts: GenerateOptions = {},
): GeneratedCity {
  // A shared projection lets many cells line up in one world; default is local to `bounds`.
  const proj = opts.projection ?? LocalProjection.fromBounds(bounds);
  const built = planParts(result, proj, overrides, layers).map((p) => p());
  return assemble(opts.name ?? 'dhaka-city', built, layers);
}

/** Same as generateCity, but reports progress and yields to the browser between layers. */
export async function generateCityAsync(
  result: ImportResult,
  bounds: Bounds,
  overrides: Overrides = {},
  layers: Layers = defaultLayers(),
  opts: AsyncGenerateOptions = {},
): Promise<GeneratedCity> {
  const proj = opts.projection ?? LocalProjection.fromBounds(bounds);
  const parts = planParts(result, proj, overrides, layers);
  const built: (THREE.Mesh | null)[] = [];
  for (let i = 0; i < parts.length; i++) {
    built.push(parts[i]());
    opts.onStep?.((i + 1) / parts.length);
    if (opts.yieldFn) await opts.yieldFn();
  }
  return assemble(opts.name ?? 'dhaka-city', built, layers);
}

/** Free GPU resources of a previously generated city. */
export function disposeCity(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
}
