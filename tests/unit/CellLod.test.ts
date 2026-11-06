import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CellLod } from '../../src/renderer/CellLod';
import { defaultLayers } from '../../src/types/project';

function cellAt(x: number, name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  for (const layer of ['roads', 'buildings', 'paths']) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
    m.name = layer;
    m.position.set(x, 5, 0);
    g.add(m);
  }
  return g;
}

function setup() {
  const world = new THREE.Group();
  const near = cellAt(0, 'near');
  const far = cellAt(10000, 'far');
  world.add(near, far);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 100, 0);
  let layers = defaultLayers();
  const lod = new CellLod({ camera, world }, () => layers, 2500);
  const vis = (cell: THREE.Group, layer: string) => cell.getObjectByName(layer)!.visible;
  return { near, far, lod, vis, setLayers: (l: typeof layers) => (layers = l) };
}

describe('CellLod', () => {
  it('hides buildings and paths in far cells but keeps roads', () => {
    const { near, far, lod, vis } = setup();
    lod.update();
    expect(vis(near, 'buildings')).toBe(true);
    expect(vis(near, 'paths')).toBe(true);
    expect(vis(far, 'buildings')).toBe(false);
    expect(vis(far, 'paths')).toBe(false);
    expect(vis(far, 'roads')).toBe(true);
  });

  it('respects layers switched off by the user, even for near cells', () => {
    const { near, lod, vis, setLayers } = setup();
    const l = defaultLayers();
    l.buildings.visible = false;
    setLayers(l);
    lod.update();
    expect(vis(near, 'buildings')).toBe(false);
    expect(vis(near, 'paths')).toBe(true);
  });

  it('shows everything while suspended and restores LOD on resume', () => {
    const { far, lod, vis } = setup();
    lod.update();
    lod.suspend();
    expect(vis(far, 'buildings')).toBe(true);
    lod.resume();
    expect(vis(far, 'buildings')).toBe(false);
  });

  it('brings a far cell back when the camera moves close', () => {
    const { far, lod, vis } = setup();
    lod.update();
    (lod as unknown as { host: { camera: THREE.Camera } }).host.camera.position.set(10000, 100, 0);
    lod.update();
    expect(vis(far, 'buildings')).toBe(true);
  });
});
