import type * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** Export a Three.js object as a binary GLB (metres, Y up) and return the bytes. */
export async function exportGLB(root: THREE.Object3D): Promise<ArrayBuffer> {
  const meshCount = (() => {
    let n = 0;
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) n++;
    });
    return n;
  })();
  if (meshCount === 0) throw new Error('Nothing to export: generate a city first.');

  const exporter = new GLTFExporter();
  const out = await exporter.parseAsync(root, { binary: true, onlyVisible: true });
  if (!(out instanceof ArrayBuffer)) throw new Error('GLB export returned an unexpected format.');
  return out;
}

/** Trigger a browser download for the given bytes. */
export function downloadBlob(data: ArrayBuffer, filename: string, mime = 'model/gltf-binary'): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
