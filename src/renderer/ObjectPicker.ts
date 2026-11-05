import * as THREE from 'three';

export interface PickedObject {
  object: THREE.Mesh;
  point: THREE.Vector3;
}

/** Click-to-select scene objects without stealing orbit-drag gestures. */
export class ObjectPicker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private down: { x: number; y: number } | null = null;
  private selected: THREE.Mesh | null = null;
  private originalMaterial: THREE.Material | THREE.Material[] | null = null;
  private highlightMaterial: THREE.Material | THREE.Material[] | null = null;
  onSelect: (picked: PickedObject | null) => void = () => {};

  constructor(private readonly camera: THREE.Camera, private readonly canvas: HTMLCanvasElement, private readonly root: THREE.Object3D) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.clearHighlight();
  }

  clearSelection(): void {
    this.clearHighlight();
    this.onSelect(null);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.down = { x: event.clientX, y: event.clientY };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.down || event.button !== 0) return;
    const moved = Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y);
    this.down = null;
    if (moved > 5) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.root, true);
    const hit = hits.find((item) => item.object instanceof THREE.Mesh && ['building', 'road', 'green', 'water'].includes(String(item.object.userData.kind)));
    if (!hit || !(hit.object instanceof THREE.Mesh)) {
      this.clearSelection();
      return;
    }
    this.clearHighlight();
    this.selected = hit.object;
    this.originalMaterial = this.selected.material;
    const source = Array.isArray(this.originalMaterial) ? this.originalMaterial[0] : this.originalMaterial;
    if (source instanceof THREE.MeshStandardMaterial) {
      const highlight = source.clone();
      highlight.emissive = new THREE.Color(0x245b9a);
      highlight.emissiveIntensity = 0.65;
      this.highlightMaterial = highlight;
      this.selected.material = highlight;
    }
    this.onSelect({ object: hit.object, point: hit.point });
  };

  private clearHighlight(): void {
    if (this.selected && this.originalMaterial) this.selected.material = this.originalMaterial;
    if (this.highlightMaterial) {
      if (Array.isArray(this.highlightMaterial)) this.highlightMaterial.forEach((m) => m.dispose());
      else this.highlightMaterial.dispose();
    }
    this.selected = null;
    this.originalMaterial = null;
    this.highlightMaterial = null;
  }
}
