import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LocalProjection } from '../data/CoordinateTransform';
import type { AreaFeature } from '../types/features';
import { ringsToShape } from './BuildingGenerator';

/** Flat filled surfaces (water, green areas) merged into one mesh at height y. */
export function generateAreas(
  features: AreaFeature[],
  proj: LocalProjection,
  opts: { name: string; color: number; y: number },
): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const f of features) {
    const shape = ringsToShape(f.outer, f.holes, proj);
    if (!shape) continue;
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2); // (east, north) -> (x, -z)
    g.translate(0, opts.y, 0);
    g.deleteAttribute('uv');
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  if (geos.length === 0) return null;
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return null;
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color: opts.color, roughness: 0.9, side: THREE.DoubleSide }),
  );
  mesh.name = opts.name;
  return mesh;
}
