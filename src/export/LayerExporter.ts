import * as THREE from 'three';
import type { Bounds } from '../types/editor';
import { exportGLB } from './GLBExporter';
import { createZip, type ZipEntry } from './ZipWriter';

/**
 * Export every visible block-layer mesh as a separate GLB plus a manifest.
 * Block-qualified names prevent file collisions when many blocks contain the
 * same layer (for example, roads.glb).
 */
export async function exportLayersZip(city: THREE.Object3D, bounds: Bounds): Promise<Uint8Array> {
  const entries: ZipEntry[] = [];
  const layers: { name: string; file: string; blockId?: string; triangles: number }[] = [];

  const meshes: THREE.Mesh[] = [];
  city.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.visible) meshes.push(mesh);
  });

  for (const mesh of meshes) {
    const blockId = typeof mesh.parent?.userData.blockId === 'string'
      ? mesh.parent.userData.blockId as string
      : undefined;
    const safeLayer = mesh.name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const safeBlock = blockId?.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    const file = safeBlock ? `${safeBlock}-${safeLayer}.glb` : `${safeLayer}.glb`;
    const glb = await exportGLB(mesh);
    const geometry = mesh.geometry;
    layers.push({
      name: mesh.name,
      file,
      ...(blockId ? { blockId } : {}),
      triangles: Math.round((geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3),
    });
    entries.push({ name: file, data: new Uint8Array(glb) });
  }
  if (entries.length === 0) throw new Error('Nothing to export: no visible layers.');

  const manifest = {
    format: 'dhaka-world-builder-export',
    version: 2,
    units: 'metres',
    upAxis: 'Y',
    note: 'All block layers share one selection-wide origin. Place them at the same transform. -Z is north, +X is east.',
    origin: { lon: (bounds.west + bounds.east) / 2, lat: (bounds.south + bounds.north) / 2 },
    bounds,
    layers,
    attribution: '© OpenStreetMap contributors (ODbL 1.0), https://www.openstreetmap.org/copyright',
  };
  entries.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  return createZip(entries);
}
