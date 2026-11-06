import * as THREE from 'three';
import type { LayerId, Layers } from '../types/project';

/** Layers that are hidden for cells far from the camera. Roads, water and green stay visible. */
export const DETAIL_LAYERS: ReadonlySet<string> = new Set(['buildings', 'paths']);

export interface LodHost {
  camera: THREE.Camera;
  /** Children are cell groups, each holding layer meshes. */
  world: THREE.Object3D;
}

/**
 * Distance-based detail for big worlds: cells farther than `detailRadiusM` from the camera drop their
 * heavy layers (buildings, paths). A mesh is visible only if its layer is switched on AND it is near.
 */
export class CellLod {
  private timer: ReturnType<typeof setInterval> | undefined;
  private suspended = false;

  constructor(
    private readonly host: LodHost,
    private readonly getLayers: () => Layers,
    private readonly detailRadiusM = 2500,
  ) {}

  start(intervalMs = 500): void {
    this.stop();
    this.timer = setInterval(() => this.update(), intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Show full detail everywhere (use while exporting, so far cells are not left out). */
  suspend(): void {
    this.suspended = true;
    this.update();
  }

  resume(): void {
    this.suspended = false;
    this.update();
  }

  update(): void {
    const cam = this.host.camera.position;
    const layers = this.getLayers();
    for (const cell of this.host.world.children) {
      let box = cell.userData.lodBox as THREE.Box3 | undefined;
      if (!box) {
        box = new THREE.Box3().setFromObject(cell);
        if (box.isEmpty()) continue;
        cell.userData.lodBox = box;
      }
      const near = this.suspended || box.distanceToPoint(cam) < this.detailRadiusM;
      for (const m of cell.children) {
        if (!DETAIL_LAYERS.has(m.name)) continue;
        m.userData.lodHidden = !near;
        m.visible = (layers[m.name as LayerId]?.visible ?? true) && near;
      }
    }
  }
}
