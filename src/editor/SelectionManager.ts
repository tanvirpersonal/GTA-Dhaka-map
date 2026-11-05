import * as THREE from 'three';
import { Emitter } from '../app/events';
import { featureAtFace, rangeOf, type PickMap } from '../generator/pick';
import type { SceneManager } from '../renderer/SceneManager';

export interface Picked {
  id: string;
  layer: string;
}

interface SelEvents extends Record<string, unknown> {
  select: Picked | null;
}

const CLICK_SLOP_PX = 4;

/** Click-to-select for generated features, including meshes nested inside city blocks. */
export class SelectionManager extends Emitter<SelEvents> {
  private readonly raycaster = new THREE.Raycaster();
  private overlay: THREE.Group | null = null;
  private selected: Picked | null = null;
  private down: { x: number; y: number } | null = null;

  constructor(private readonly sm: SceneManager) {
    super();
    const el = sm.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.down = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!d || e.button !== 0) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP_PX) return;
      this.pickAt(e.clientX, e.clientY);
    });
  }

  get current(): Picked | null {
    return this.selected;
  }

  select(p: Picked | null): void {
    this.selected = p;
    this.refreshHighlight();
    this.emit('select', p);
  }

  /** Find a layer mesh by both layer name and feature ID across all block groups. */
  private findFeatureMesh(city: THREE.Group, layer: string, id: string): THREE.Mesh | null {
    let found: THREE.Mesh | null = null;
    city.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (found || !mesh.isMesh || mesh.name !== layer) return;
      const pick = mesh.userData.pick as PickMap | undefined;
      if (pick && rangeOf(pick, id)) found = mesh;
    });
    return found;
  }

  /** Re-draw the highlight, e.g. after the city was regenerated. */
  refreshHighlight(): void {
    this.clearOverlay();
    const sel = this.selected;
    const city = this.sm.currentCity;
    if (!sel || !city) return;
    const mesh = this.findFeatureMesh(city, sel.layer, sel.id);
    const pick = mesh?.userData.pick as PickMap | undefined;
    const range = pick && rangeOf(pick, sel.id);
    if (!mesh || !range) return;

    const src = mesh.geometry.getAttribute('position');
    const [a, b] = range;
    const arr = new Float32Array((b - a) * 3);
    for (let i = a; i < b; i++) {
      arr[(i - a) * 3] = src.getX(i);
      arr[(i - a) * 3 + 1] = src.getY(i);
      arr[(i - a) * 3 + 2] = src.getZ(i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.computeVertexNormals();

    const fill = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.55, depthTest: false }),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 20),
      new THREE.LineBasicMaterial({ color: 0xffe08a, depthTest: false }),
    );
    fill.renderOrder = edges.renderOrder = 10;
    this.overlay = new THREE.Group();
    this.overlay.name = 'selection-overlay';
    this.overlay.add(fill, edges);
    this.sm.scene.add(this.overlay);
  }

  private clearOverlay(): void {
    if (!this.overlay) return;
    this.sm.scene.remove(this.overlay);
    this.overlay.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    this.overlay = null;
  }

  private pickAt(clientX: number, clientY: number): void {
    const city = this.sm.currentCity;
    if (!city) return;
    const rect = this.sm.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.sm.camera);

    const meshes: THREE.Mesh[] = [];
    city.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.visible && mesh.userData.pick) meshes.push(mesh);
    });
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit || hit.faceIndex == null) {
      this.select(null);
      return;
    }
    const id = featureAtFace(hit.object.userData.pick as PickMap, hit.faceIndex);
    this.select(id ? { id, layer: hit.object.name } : null);
  }
}
