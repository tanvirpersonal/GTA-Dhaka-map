import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LocalProjection } from '../data/CoordinateTransform';
import type { BuildingFeature, LonLat } from '../types/features';
import type { Overrides } from '../types/project';
import type { PickMap } from './pick';

const LEVEL_HEIGHT_M = 3.2;
const DEFAULT_HEIGHTS: Record<string, number> = {
  house: 8,
  residential: 12,
  apartments: 18,
  commercial: 16,
  retail: 10,
  office: 24,
  industrial: 9,
  warehouse: 8,
  hospital: 20,
  school: 11,
  university: 15,
  mosque: 14,
  shed: 3,
  garage: 3,
  roof: 4,
};

/** Stable 0..1 value from a string id, so unknown heights vary but never change between runs. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function resolveHeight(f: BuildingFeature): number {
  if (f.heightM) return Math.max(2.5, f.heightM);
  if (f.levels) return Math.max(2.5, f.levels * LEVEL_HEIGHT_M);
  const base = DEFAULT_HEIGHTS[f.tags.building] ?? 10;
  return base * (0.8 + hash01(f.id) * 0.6);
}

/** Build a THREE.Shape in (east, north) metres. Returns null for degenerate rings. */
export function ringsToShape(outer: LonLat[], holes: LonLat[][], proj: LocalProjection): THREE.Shape | null {
  const toPts = (ring: LonLat[]) => ring.slice(0, -1).map((p) => new THREE.Vector2(...proj.toLocal(p)));
  const o = toPts(outer);
  if (o.length < 3) return null;
  const shape = new THREE.Shape(o);
  for (const h of holes) {
    const hp = toPts(h);
    if (hp.length >= 3) shape.holes.push(new THREE.Path(hp));
  }
  return shape;
}

/** Extrude all buildings into one merged mesh (1 unit = 1 m, Y up). */
export function generateBuildings(
  features: BuildingFeature[],
  proj: LocalProjection,
  overrides: Overrides = {},
): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  const ids: string[] = [];
  const walkColliders: Array<{ points: Array<[number, number]> }> = [];
  const color = new THREE.Color();

  for (const f of features) {
    const ov = overrides[f.id];
    if (ov?.hidden) continue;
    const shape = ringsToShape(f.outer, f.holes, proj);
    if (!shape) continue;
    const height = ov?.heightM ?? resolveHeight(f);
    let g: THREE.BufferGeometry;
    try {
      g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    } catch {
      continue;
    }
    // Shape lies in XY with extrusion along +Z; rotate so north -> -Z and height -> +Y.
    g.rotateX(-Math.PI / 2);

    // Per-building tint by height gives readable variation with one draw call.
    const t = Math.min(1, height / 40);
    color.setHSL(0.58, 0.08 + 0.1 * t, 0.42 + 0.22 * t + (hash01(f.id) - 0.5) * 0.06);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    geos.push(g.index ? g.toNonIndexed() : g);
    ids.push(f.id);
    // Keep the original footprint as a lightweight walking collider (X=east, Z=-north).
    walkColliders.push({ points: f.outer.slice(0, -1).map((p) => { const [east, north] = proj.toLocal(p); return [east, -north] as [number, number]; }) });
  }

  if (geos.length === 0) return null;
  const starts: number[] = [];
  let acc = 0;
  for (const g of geos) {
    starts.push(acc);
    acc += g.getAttribute('position').count;
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) return null;
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }));
  mesh.name = 'buildings';
  mesh.userData.pick = { ids, starts, total: acc } satisfies PickMap;
  mesh.userData.walkColliders = walkColliders;
  return mesh;
}
