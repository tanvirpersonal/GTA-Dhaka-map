import * as THREE from 'three';
import { disposeCity } from '../generator/CityGenerator';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type WalkCollider = { points: Array<[number, number]> };

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
  private cameraLookTarget = new THREE.Vector3();
  private walkColliders: WalkCollider[] = [];
  private walkTime = 0;
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
    this.yaw -= event.movementX * 0.0019;
    this.pitch = THREE.MathUtils.clamp(this.pitch - event.movementY * 0.00145, -0.42, 0.22);
  };
  private readonly onPointerLockChange = (): void => {
    if (this.walking && document.pointerLockElement !== this.renderer.domElement) this.setWalkMode(false);
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
    this.controls.dampingFactor = 0.075;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.85;
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

  get currentCity(): THREE.Group | null { return this.city; }
  get isWalkMode(): boolean { return this.walking; }

  setCity(group: THREE.Group | null, frame = true): void {
    if (this.city) {
      this.scene.remove(this.city);
      disposeCity(this.city);
    }
    this.city = group;
    this.walkColliders = [];
    if (!group) return;
    this.scene.add(group);
    group.traverse((object) => {
      const colliders = object.userData.walkColliders as WalkCollider[] | undefined;
      if (colliders) this.walkColliders.push(...colliders);
    });
    if (!frame) return;
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z, 100);
    this.camera.position.set(r * 0.7, r * 0.6, r * 0.7);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    if (this.walker) this.walker.position.set(0, 0, 0);
  }

  /** Add a completed city block without replacing blocks already rendered. */
  addCityBlock(block: THREE.Group): void {
    if (!this.city) {
      this.city = new THREE.Group();
      this.city.name = 'dhaka-city';
      this.scene.add(this.city);
      this.walkColliders = [];
    }
    this.city.add(block);
    block.traverse((object) => {
      const colliders = object.userData.walkColliders as WalkCollider[] | undefined;
      if (colliders) this.walkColliders.push(...colliders);
    });
  }

  /** Frame the shared city origin using the full selected geographic extent. */
  frameCity(widthM: number, heightM: number): void {
    const r = Math.max(widthM, heightM, 100);
    this.camera.position.set(r * 0.72, r * 0.62, r * 0.72);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
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
      this.resolveBuildingCollision(this.walker.position);
      this.yaw = 0;
      this.pitch = -0.12;
      this.walkTime = 0;
      this.lastMoveTime = performance.now();
      this.cameraLookTarget.copy(this.walker.position).add(new THREE.Vector3(0, 1.35, 0));
      this.followWalker(1);
    } else if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.onWalkModeChange(active);
  }

  private createWalker(): THREE.Group {
    const person = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.78 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x202633, roughness: 0.88 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc58b62, roughness: 0.82 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.88 });
    const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.frustumCulled = true;
      parent.add(mesh);
      return mesh;
    };

    // Slightly more human proportions, layered clothing and pivoted limbs for a walk cycle.
    add(person, new THREE.CapsuleGeometry(0.34, 0.68, 5, 10), shirt, 0, 1.28, 0);
    add(person, new THREE.SphereGeometry(0.235, 16, 12), skin, 0, 2.08, 0);
    add(person, new THREE.CylinderGeometry(0.19, 0.22, 0.12, 12), skin, 0, 1.78, 0);
    add(person, new THREE.BoxGeometry(0.24, 0.1, 0.08), shoe, 0, 2.11, -0.205);

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.16, 0.83, 0);
    person.add(leftLeg);
    add(leftLeg, new THREE.CapsuleGeometry(0.135, 0.52, 4, 8), pants, 0, -0.31, 0);
    add(leftLeg, new THREE.BoxGeometry(0.23, 0.13, 0.4), shoe, 0, -0.72, -0.07);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.16, 0.83, 0);
    person.add(rightLeg);
    add(rightLeg, new THREE.CapsuleGeometry(0.135, 0.52, 4, 8), pants, 0, -0.31, 0);
    add(rightLeg, new THREE.BoxGeometry(0.23, 0.13, 0.4), shoe, 0, -0.72, -0.07);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.39, 1.58, 0);
    person.add(leftArm);
    add(leftArm, new THREE.CapsuleGeometry(0.105, 0.48, 4, 8), shirt, 0, -0.27, 0);
    add(leftArm, new THREE.SphereGeometry(0.105, 10, 8), skin, 0, -0.57, 0);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.39, 1.58, 0);
    person.add(rightArm);
    add(rightArm, new THREE.CapsuleGeometry(0.105, 0.48, 4, 8), shirt, 0, -0.27, 0);
    add(rightArm, new THREE.SphereGeometry(0.105, 10, 8), skin, 0, -0.57, 0);

    person.userData.gait = { leftLeg, rightLeg, leftArm, rightArm };
    return person;
  }

  /** Push the character capsule out of building footprints; walls remain solid from every side. */
  private resolveBuildingCollision(position: THREE.Vector3): void {
    const radius = 0.52;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const collider of this.walkColliders) {
        const pts = collider.points;
        if (pts.length < 3) continue;
        let inside = false;
        let minDistSq = Infinity;
        let nearestX = position.x;
        let nearestZ = position.z;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [ax, az] = pts[j];
          const [bx, bz] = pts[i];
          if ((az > position.z) !== (bz > position.z) &&
              position.x < ((bx - ax) * (position.z - az)) / (bz - az) + ax) inside = !inside;
          const dx = bx - ax;
          const dz = bz - az;
          const lenSq = dx * dx + dz * dz;
          const t = lenSq ? THREE.MathUtils.clamp(((position.x - ax) * dx + (position.z - az) * dz) / lenSq, 0, 1) : 0;
          const cx = ax + dx * t;
          const cz = az + dz * t;
          const distSq = (position.x - cx) ** 2 + (position.z - cz) ** 2;
          if (distSq < minDistSq) { minDistSq = distSq; nearestX = cx; nearestZ = cz; }
        }
        if (!inside && minDistSq >= radius * radius) continue;
        let nx = position.x - nearestX;
        let nz = position.z - nearestZ;
        let length = Math.hypot(nx, nz);
        if (length < 1e-5) {
          const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
          const cz = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
          nx = nearestX - cx;
          nz = nearestZ - cz;
          length = Math.hypot(nx, nz) || 1;
        }
        const direction = inside ? -1 : 1;
        const push = inside ? radius + Math.sqrt(minDistSq) : radius - length + 0.015;
        position.x += (nx / length) * push * direction;
        position.z += (nz / length) * push * direction;
        moved = true;
      }
      if (!moved) break;
    }
  }

  private followWalker(dt: number): void {
    if (!this.walker) return;
    const target = this.walker.position.clone().add(new THREE.Vector3(0, 1.38, 0));
    const distance = 7.2;
    const horizontal = Math.cos(this.pitch) * distance;
    const desired = new THREE.Vector3(
      target.x - Math.sin(this.yaw) * horizontal,
      target.y + 1.9 - Math.sin(this.pitch) * distance,
      target.z - Math.cos(this.yaw) * horizontal,
    );
    const smoothing = 1 - Math.exp(-9.5 * Math.max(0, dt));
    this.camera.position.lerp(desired, smoothing);
    this.cameraLookTarget.lerp(target, 1 - Math.exp(-13 * Math.max(0, dt)));
    this.camera.lookAt(this.cameraLookTarget);
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
    const now = performance.now();
    const dt = Math.min((now - this.lastMoveTime) / 1000, 0.05);
    if (this.walking && this.walker) this.updateWalker(dt);
    else this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (now - this.lastFpsTime >= 1000) {
      this.onFps(Math.round((this.frames * 1000) / (now - this.lastFpsTime)));
      this.frames = 0;
      this.lastFpsTime = now;
    }
  };

  private updateWalker(dt: number): void {
    if (!this.walker) return;
    this.lastMoveTime = performance.now();
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const side = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const moving = Boolean(forward || side);
    if (moving) {
      const direction = new THREE.Vector3(
        Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side,
        0,
        Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side,
      ).normalize();
      const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const speed = sprinting ? 15 : 6.2;
      const next = this.walker.position.clone().addScaledVector(direction, speed * dt);
      this.resolveBuildingCollision(next);
      this.walker.position.x = next.x;
      this.walker.position.z = next.z;
      this.walker.rotation.y = Math.atan2(direction.x, direction.z);
      this.walkTime += dt * (sprinting ? 12 : 8);
    }
    const gait = this.walker.userData.gait as { leftLeg: THREE.Group; rightLeg: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group } | undefined;
    if (gait) {
      const swing = moving ? Math.sin(this.walkTime) * 0.48 : 0;
      const settle = moving ? 1 : 1 - Math.exp(-10 * dt);
      gait.leftLeg.rotation.x = moving ? swing : THREE.MathUtils.damp(gait.leftLeg.rotation.x, 0, 10, dt);
      gait.rightLeg.rotation.x = moving ? -swing : THREE.MathUtils.damp(gait.rightLeg.rotation.x, 0, 10, dt);
      gait.leftArm.rotation.x = moving ? -swing * 0.72 : THREE.MathUtils.damp(gait.leftArm.rotation.x, 0, 10, dt);
      gait.rightArm.rotation.x = moving ? swing * 0.72 : THREE.MathUtils.damp(gait.rightArm.rotation.x, 0, 10, dt);
      this.walker.position.y = moving ? Math.abs(Math.sin(this.walkTime * 2)) * 0.035 : THREE.MathUtils.damp(this.walker.position.y, 0, 10, dt);
      void settle;
    }
    this.followWalker(dt);
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
