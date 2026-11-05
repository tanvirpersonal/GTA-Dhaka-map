import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LocalProjection } from '../data/CoordinateTransform';
import type { LineFeature } from '../types/features';
import type { Overrides } from '../types/project';
import type { PickMap } from './pick';

const ROAD_WIDTH_M: Record<string, number> = {
  motorway: 14, trunk: 12, primary: 11, secondary: 9, tertiary: 8,
  motorway_link: 7, trunk_link: 7, primary_link: 6, secondary_link: 6, tertiary_link: 6,
  residential: 6, unclassified: 6, living_street: 5, service: 4,
};
const WATERWAY_WIDTH_M: Record<string, number> = { river: 24, canal: 10, stream: 3, drain: 3 };
const LANE_WIDTH_M = 3.2;

export function resolveWidth(f: LineFeature): number {
  if (f.widthM) return f.widthM;
  if (f.kind === 'path') return 1.8;
  if (f.kind === 'waterway') return WATERWAY_WIDTH_M[f.highway] ?? 4;
  if (f.lanes) return Math.max(3.5, f.lanes * LANE_WIDTH_M);
  return ROAD_WIDTH_M[f.highway] ?? 5;
}

/**
 * Flat ribbon along a polyline using averaged (mitered, clamped) normals.
 * Points are [east, north]; output lies in the XZ plane at height y (north -> -Z).
 */
export function ribbonGeometry(points: [number, number][], width: number, y: number): THREE.BufferGeometry | null {
  // Drop consecutive duplicates.
  const p = points.filter((pt, i) => i === 0 || Math.hypot(pt[0] - points[i - 1][0], pt[1] - points[i - 1][1]) > 0.01);
  if (p.length < 2) return null;
  const half = width / 2;
  const pos: number[] = [];
  const idx: number[] = [];

  const dir = (a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l] as const;
  };

  for (let i = 0; i < p.length; i++) {
    const dPrev = i > 0 ? dir(p[i - 1], p[i]) : dir(p[i], p[i + 1]);
    const dNext = i < p.length - 1 ? dir(p[i], p[i + 1]) : dPrev;
    // Left normals of each segment, averaged for the join.
    let nx = -(dPrev[1] + dNext[1]);
    let ny = dPrev[0] + dNext[0];
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-6) {
      nx = -dPrev[1];
      ny = dPrev[0];
    } else {
      nx /= nl;
      ny /= nl;
    }
    // Miter scale, clamped to avoid spikes on sharp corners.
    const cos = nx * -dPrev[1] + ny * dPrev[0];
    const scale = Math.min(2, 1 / Math.max(cos, 0.5));
    const ox = nx * half * scale;
    const oy = ny * half * scale;
    pos.push(p[i][0] + ox, y, -(p[i][1] + oy));
    pos.push(p[i][0] - ox, y, -(p[i][1] - oy));
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Ensure upward-facing normals regardless of draw direction.
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

export interface LineStyle {
  name: string;
  color: number;
  y: number;
}

/** Merge all line features of one style into a single double-sided mesh. */
export function generateLines(
  features: LineFeature[],
  proj: LocalProjection,
  style: LineStyle,
  overrides: Overrides = {},
): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  const ids: string[] = [];
  for (const f of features) {
    const ov = overrides[f.id];
    if (ov?.hidden) continue;
    const g = ribbonGeometry(f.points.map((p) => proj.toLocal(p)), ov?.widthM ?? resolveWidth(f), style.y);
    if (g) {
      geos.push(g.index ? g.toNonIndexed() : g);
      ids.push(f.id);
    }
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
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color: style.color, roughness: 0.95, side: THREE.DoubleSide }),
  );
  mesh.name = style.name;
  mesh.userData.pick = { ids, starts, total: acc } satisfies PickMap;
  return mesh;
}
