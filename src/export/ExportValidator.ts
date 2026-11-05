import * as THREE from 'three';

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  meshes: number;
  triangles: number;
  size: { x: number; y: number; z: number };
}

const MAX_TRIANGLES_WARN = 2_000_000;
const MAX_EXTENT_WARN_M = 3000;
const DEGENERATE_AREA = 1e-9;

/** Check geometry and material references before export. Errors block export; warnings do not. */
export function validateForExport(root: THREE.Object3D): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  let meshes = 0;
  let triangles = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.visible) return; // hidden layers are not exported
    meshes++;
    const name = m.name || `mesh#${meshes}`;
    const pos = m.geometry.getAttribute('position');
    if (!pos || pos.count === 0) {
      errors.push(`${name}: no vertices.`);
      return;
    }
    if (!m.material) errors.push(`${name}: missing material.`);

    let bad = 0;
    for (let i = 0; i < pos.count; i++) {
      if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))) bad++;
    }
    if (bad > 0) {
      errors.push(`${name}: ${bad} vertices have NaN/Infinity coordinates.`);
      return;
    }

    const idx = m.geometry.index;
    const triCount = (idx ? idx.count : pos.count) / 3;
    if (!Number.isInteger(triCount)) errors.push(`${name}: vertex count is not a multiple of 3.`);
    triangles += Math.floor(triCount);

    let degenerate = 0;
    for (let t = 0; t < Math.floor(triCount); t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      if (b.sub(a).cross(c.sub(a)).lengthSq() < DEGENERATE_AREA) degenerate++;
    }
    if (degenerate > 0) warnings.push(`${name}: ${degenerate} degenerate triangles.`);
  });

  if (meshes === 0) errors.push('Nothing to export: no visible meshes.');
  if (triangles > MAX_TRIANGLES_WARN) warnings.push(`High triangle count (${triangles.toLocaleString()}); consider a smaller area.`);

  const s = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  if (Math.max(s.x, s.z) > MAX_EXTENT_WARN_M) warnings.push(`Scene is ${Math.round(Math.max(s.x, s.z))} m across; very large for a single asset.`);

  return { ok: errors.length === 0, errors, warnings, meshes, triangles, size: { x: s.x, y: s.y, z: s.z } };
}
