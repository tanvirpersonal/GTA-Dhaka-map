import * as THREE from 'three';
import { disposeCity } from '../generator/CityGenerator';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Owns the Three.js renderer, camera, controls and render loop. */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  onFps: (fps: number) => void = () => {};
  onWalkModeChange: (active: boolean) => void = () => {};

  private readonly resizeObserver: ResizeObserver;
  private frames = 0;
  private lastFpsTime = performance.now();
  private running = false;
  private city: THREE.Group | null = null;
  private walker: THREE.Group | null = null;
  private walking = false;
  private yaw = 0;
  private pitch = -0.12;
  private readonly keys = new Set<string>();
  private lastMoveTime = 0;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.walking) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
    }
    if (event.code === 'Escape') this.setWalkMode(false);
  };
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };
  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.walking || document.pointerLockElement !== this.renderer.domElement) return;
    this.yaw -= event.movementX * 0.0025;
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.0018, -0.55, 0.35);
  };
  private readonly onPointerLockChange = (): void => {
    if (this.walking && document.pointerLockElement !== this.renderer.domElement) {
      this.setWalkMode(false);
    }
  };

  constructor(private readonly container: HTMLElement) {
    this.scene.background = new THREE.Color(0x0b0d11);
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 20000);
    this.camera.position.set(220, 180, 220);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.target.set(0, 0, 0);

    this.addLighting();
    this.addGround();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
  }

  private readonly onCanvasClick = (): void => {
    if (this.walking && document.pointerLockElement !== this.renderer.domElement) {
      void this.renderer.domElement.requestPointerLock();
    }
  };

  get currentCity(): THREE.Group | null {
    return this.city;
  }

  get isWalkMode(): boolean {
    return this.walking;
  }

  setCity(group: THREE.Group | null, frame = true): void {
    if (this.city) {
      this.scene.remove(this.city);
      disposeCity(this.city);
    }
    this.city = group;
    if (!group) return;
    this.scene.add(group);
    if (!frame) return;
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z, 100);
    this.camera.position.set(r * 0.7, r * 0.6, r * 0.7);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    if (this.walker) this.walker.position.set(0, 0, 0);
  }

  /** Toggle a visible third-person character that can explore the generated city. */
  setWalkMode(active: boolean): void {
    if (active && !this.city) return;
    if (this.walking === active) return;
    this.walking = active;
    this.keys.clear();
    this.controls.enabled = !active;
    if (active) {
      if (!this.walker) {
        this.walker = this.createWalker();
        this.scene.add(this.walker);
      }
      const bounds = new THREE.Box3().setFromObject(this.city!);
      const center = bounds.getCenter(new THREE.Vector3());
      this.walker.position.set(center.x, 0, center.z);
      this.yaw = 0;
      this.pitch = -0.12;
      this.lastMoveTime = performance.now();
      this.followWalker();
    } else if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.onWalkModeChange(active);
  }

  private createWalker(): THREE.Group {
    const person = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x202633, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc58b62, roughness: 0.85 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9 });
    const addPart = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      person.add(mesh);
      return mesh;
    };
    addPart(new THREE.CapsuleGeometry(0.34, 0.62, 4, 8), shirt, 0, 1.28, 0);
    addPart(new THREE.SphereGeometry(0.23, 12, 10), skin, 0, 2.05, 0);
    addPart(new THREE.CapsuleGeometry(0.13, 0.55, 3, 6), pants, -0.16, 0.48, 0);
    addPart(new THREE.CapsuleGeometry(0.13, 0.55, 3, 6), pants, 0.16, 0.48, 0);
    addPart(new THREE.BoxGeometry(0.22, 0.12, 0.38), shoe, -0.16, 0.08, -0.07);
    addPart(new THREE.BoxGeometry(0.22, 0.12, 0.38), shoe, 0.16, 0.08, -0.07);
    addPart(new THREE.CapsuleGeometry(0.11, 0.48, 3, 6), shirt, -0.43, 1.35, 0);
    addPart(new THREE.CapsuleGeometry(0.11, 0.48, 3, 6), shirt, 0.43, 1.35, 0);
    person.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.frustumCulled = true;
    });
    return person;
  }

  private followWalker(): void {
    if (!this.walker) return;
    const target = this.walker.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const distance = 7.5;
    const horizontal = Math.cos(this.pitch) * distance;
    const desired = new THREE.Vector3(
      target.x - Math.sin(this.yaw) * horizontal,
      target.y + 2.2 - Math.sin(this.pitch) * distance,
      target.z - Math.cos(this.yaw) * horizontal,
    );
    this.camera.position.lerp(desired, 0.22);
    this.camera.lookAt(target);
  }

  setTopDown(extent = 600): void {
    this.setWalkMode(false);
    this.camera.position.set(0, extent, 0.001);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setPerspective(): void {
    this.setWalkMode(false);
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
    this.setWalkMode(false);
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.dispose();
  }

  private tick = (): void => {
    if (this.walking && this.walker) this.updateWalker();
    else this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.onFps(Math.round((this.frames * 1000) / (now - this.lastFpsTime)));
      this.frames = 0;
      this.lastFpsTime = now;
    }
  };

  private updateWalker(): void {
    if (!this.walker) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastMoveTime) / 1000, 0.05);
    this.lastMoveTime = now;
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const side = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    if (forward || side) {
      const direction = new THREE.Vector3(
        Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side,
        0,
        Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side,
      ).normalize();
      const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 18 : 7;
      this.walker.position.addScaledVector(direction, speed * dt);
      this.walker.rotation.y = Math.atan2(direction.x, direction.z);
    }
    this.followWalker();
  }

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
