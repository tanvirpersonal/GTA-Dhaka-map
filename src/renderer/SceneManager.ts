import * as THREE from 'three';
import { disposeCity } from '../generator/CityGenerator';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Owns the Three.js renderer, camera, controls and render loop. */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  /** Updated once per second; shown in the status bar. */
  onFps: (fps: number) => void = () => {};

  private readonly resizeObserver: ResizeObserver;
  private frames = 0;
  private lastFpsTime = performance.now();
  private running = false;

  constructor(private readonly container: HTMLElement) {
    this.scene.background = new THREE.Color(0x0b0d11);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 20000);
    this.camera.position.set(220, 180, 220);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // keep camera above ground
    this.controls.target.set(0, 0, 0);

    this.addLighting();
    this.addGround();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  /** Root of everything generated. Each child is one cell (or a single city) holding layer meshes. */
  readonly world = new THREE.Group();
  private worldAdded = false;

  private ensureWorld(): void {
    if (this.worldAdded) return;
    this.world.name = 'dhaka-world';
    this.scene.add(this.world);
    this.worldAdded = true;
  }

  /**
   * What to export: the single group when only one exists (keeps flat layer names),
   * the whole world when there are many cells, or null when empty.
   */
  get currentCity(): THREE.Object3D | null {
    const n = this.world.children.length;
    if (n === 0) return null;
    return n === 1 ? this.world.children[0] : this.world;
  }

  /** Names of the cells currently in the scene. */
  get cellIds(): string[] {
    return this.world.children.map((c) => c.name);
  }

  /** Add a cell, replacing (and freeing) any existing cell with the same name. */
  setCell(group: THREE.Group): void {
    this.ensureWorld();
    this.removeCell(group.name);
    this.world.add(group);
  }

  removeCell(id: string): void {
    const old = this.world.getObjectByName(id);
    if (!old) return;
    this.world.remove(old);
    disposeCity(old);
  }

  clearCells(): void {
    for (const id of this.cellIds) this.removeCell(id);
  }

  /** Replace everything with a single city and optionally frame the camera around it. */
  setCity(group: THREE.Group | null, frame = true): void {
    this.clearCells();
    if (!group) return;
    this.setCell(group);
    if (frame) this.frameWorld();
  }

  /** Point the camera at the whole generated world from a comfortable angle. */
  frameWorld(): void {
    const box = new THREE.Box3().setFromObject(this.world);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.z, 100);
    this.camera.position.set(center.x + r * 0.7, r * 0.6, center.z + r * 0.7);
    this.controls.target.set(center.x, 0, center.z);
    this.controls.update();
  }

  /** Top-down camera preset, framing roughly `extent` metres across. */
  setTopDown(extent = 600): void {
    this.camera.position.set(0, extent, 0.001);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /** Default orbit camera preset. */
  setPerspective(): void {
    this.camera.position.set(220, 180, 220);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.renderer.setAnimationLoop(this.tick);
  }

  dispose(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }

  private tick = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.onFps(Math.round((this.frames * 1000) / (now - this.lastFpsTime)));
      this.frames = 0;
      this.lastFpsTime = now;
    }
  };

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private addLighting(): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30343c, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(300, 500, 200);
    this.scene.add(sun);
  }

  private addGround(): void {
    // 1 unit = 1 metre. 2 km grid with 100 m cells as a scale reference.
    const grid = new THREE.GridHelper(2000, 20, 0x4ea1ff, 0x2a303b);
    this.scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);
  }
}
