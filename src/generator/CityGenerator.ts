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

/** Turn imported features into a 3D city group in local metres (Y up, origin at selection centre). */
export function generateCity(
  result: ImportResult,
  bounds: Bounds,
  overrides: Overrides = {},
  layers: Layers = defaultLayers(),
): GeneratedCity {
  const proj = LocalProjection.fromBounds(bounds);
  const group = new THREE.Group();
  group.name = 'dhaka-city';

  const pick = <T extends { kind: string }>(kind: string) =>
    result.features.filter((f) => f.kind === kind) as unknown as T[];
  const lines = (k: 'road' | 'path' | 'waterway') => pick<LineFeature>(k);

  const parts = [
    generateAreas(pick<AreaFeature>('green'), proj, { name: 'green', color: layers.green.color, y: 0.01 }),
    generateAreas(pick<AreaFeature>('water'), proj, { name: 'water', color: layers.water.color, y: 0.02 }),
    generateLines(lines('waterway'), proj, { name: 'waterways', color: layers.waterways.color, y: 0.03 }, overrides),
    generateLines(lines('road'), proj, { name: 'roads', color: layers.roads.color, y: 0.06 }, overrides),
    generateLines(lines('path'), proj, { name: 'paths', color: layers.paths.color, y: 0.09 }, overrides),
    generateBuildings(pick<BuildingFeature>('building'), proj, overrides),
  ];

  let triangles = 0;
  let meshes = 0;
  for (const m of parts) {
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

  const sizeBox = new THREE.Box3().setFromObject(group);
  const size = sizeBox.getSize(new THREE.Vector3());
  return { group, stats: { triangles: Math.round(triangles), meshes, widthM: size.x, heightM: size.y } };
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
