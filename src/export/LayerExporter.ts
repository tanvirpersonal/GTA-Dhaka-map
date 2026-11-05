import * as THREE from 'three';
import type { Bounds } from '../types/editor';
import { exportGLB } from './GLBExporter';
import { createZip, type ZipEntry } from './ZipWriter';

/**
 * Export each visible layer as its own GLB plus a manifest, bundled as a ZIP.
 * Separate files let you import, replace or LOD layers independently in Unreal.
 */
export async function exportLayersZip(city: THREE.Object3D, bounds: Bounds): Promise<Uint8Array> {
  const entries: ZipEntry[] = [];
  const layers: { name: string; file: string; triangles: number }[] = [];

  for (const child of city.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) continue;
    const glb = await exportGLB(mesh);
    const file = `${mesh.name}.glb`;
    const g = mesh.geometry;
    layers.push({ name: mesh.name, file, triangles: Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3) });
    entries.push({ name: file, data: new Uint8Array(glb) });
  }
  if (entries.length === 0) throw new Error('Nothing to export: no visible layers.');

  const manifest = {
    format: 'dhaka-world-builder-export',
    version: 1,
    units: 'metres',
    upAxis: 'Y',
    note: 'All layers share one origin. Place them at the same transform. -Z is north, +X is east.',
    origin: { lon: (bounds.west + bounds.east) / 2, lat: (bounds.south + bounds.north) / 2 },
    bounds,
    layers,
    attribution: '© OpenStreetMap contributors (ODbL 1.0), https://www.openstreetmap.org/copyright',
  };
  entries.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  return createZip(entries);
}
