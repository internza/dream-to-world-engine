// @ts-expect-error - CDN ESM import is resolved by the browser at runtime.
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import type { WorldModel, WorldEntity } from "../core/transform.js";

type MeshMap = Map<string, THREE.Mesh>;

let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let worldGroup: THREE.Group | null = null;
let ambientLight: THREE.AmbientLight | null = null;
let directionalLight: THREE.DirectionalLight | null = null;
let fillLight: THREE.DirectionalLight | null = null;
let animationId: number | null = null;
let canvasWrap: HTMLElement | null = null;
let yaw = 0;
let pitch = 0;
let lastFrame = 0;
let pointerLocked = false;
const pressedKeys = new Set<string>();
const MOVE_SPEED = 6;
const LOOK_SENSITIVITY = 0.002;
const MOVE_DAMPING = 0.12;
const movementVelocity = new THREE.Vector3();
let lastSize = { width: 0, height: 0 };

const BASE_AMBIENT = 0.4;
const BASE_DIRECTIONAL = 0.8;

export function initRenderer(canvas: HTMLCanvasElement): void {
  if (renderer) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b101a);
  scene.fog = new THREE.Fog(0x0b101a, 12, 55);
  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
  camera.position.set(0, 6, 12);
  camera.lookAt(0, 0, 0);
  syncAnglesToCamera();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
  directionalLight = new THREE.DirectionalLight(0xffffff, 1.25);
  directionalLight.position.set(6, 10, 4);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(1024, 1024);
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = 40;
  directionalLight.shadow.camera.left = -16;
  directionalLight.shadow.camera.right = 16;
  directionalLight.shadow.camera.top = 16;
  directionalLight.shadow.camera.bottom = -16;

  fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
  fillLight.position.set(-6, 6, -4);

  scene.add(ambientLight, directionalLight, fillLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 32),
    new THREE.MeshStandardMaterial({
      color: 0x1b1f27,
      roughness: 0.9,
      metalness: 0.05
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const resize = () => resizeRenderer(canvas);
  window.addEventListener("resize", resize);
  resizeRenderer(canvas);

  canvasWrap = canvas.closest(".canvas-wrap");

  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    pointerLocked = document.pointerLockElement === canvas;
    if (canvasWrap) {
      canvasWrap.classList.toggle("is-expanded", pointerLocked);
    }
    document.body.classList.toggle("has-expanded", pointerLocked);
    resizeRenderer(canvas, true);
  });

  document.addEventListener("mousemove", (event) => {
    if (!pointerLocked || !camera) return;
    yaw -= event.movementX * LOOK_SENSITIVITY;
    pitch -= event.movementY * LOOK_SENSITIVITY;
    const limit = Math.PI / 2 - 0.05;
    pitch = Math.max(-limit, Math.min(limit, pitch));
    camera.rotation.set(pitch, yaw, 0, "YXZ");
  });

  document.addEventListener("keydown", (event) => {
    pressedKeys.add(event.code);
  });

  document.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.code);
  });

  const animate = () => {
    if (renderer && scene && camera) {
      resizeRenderer(canvas, false);
      updateMovement();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    }
  };

  animate();
}

export function renderWorld(world: WorldModel): void {
  if (!scene) return;

  disposeWorld();
  if (ambientLight) ambientLight.intensity = 0.25;
  if (directionalLight) directionalLight.intensity = 1.25;
  if (fillLight) fillLight.intensity = 0.35;

  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const meshById: MeshMap = new Map();
  const entityById = new Map<string, WorldEntity>();

  world.entities.forEach((entity, index) => {
    entityById.set(entity.id, entity);
    const mesh = createMeshForEntity(entity);
    const x = index * 3.5;

    mesh.position.set(x, baseYForEntity(entity), 0);
    worldGroup?.add(mesh);
    meshById.set(entity.id, mesh);
  });

  positionCameraAtStart(world, meshById);

  world.relationships.forEach((relation) => {
    const fromEntity = entityById.get(relation.from);
    const toEntity = entityById.get(relation.to);
    const fromMesh = meshById.get(relation.from);
    const toMesh = meshById.get(relation.to);

    if (!fromEntity || !fromMesh || !toMesh || !toEntity) return;

    if (relation.type === "modifies" && fromEntity.type === "descriptor") {
      applyDescriptor(fromEntity.attributes.name, toMesh);
    }

    if (relation.type === "above") {
      fromMesh.position.y = toMesh.position.y + 4;
    }
  });

  centerWorld(worldGroup);
}

export function disposeWorld(): void {
  if (!scene || !worldGroup) return;

  worldGroup.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((material) => material.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });

  scene.remove(worldGroup);
  worldGroup = null;
}

function createMeshForEntity(entity: WorldEntity): THREE.Mesh {
  if (entity.type === "place") {
    return new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.22, 3.2),
      new THREE.MeshStandardMaterial({
        color: 0x2c5b4c,
        roughness: 0.85,
        metalness: 0.05
      })
    );
  }

  if (entity.type === "object") {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.6, 1.1),
      new THREE.MeshStandardMaterial({
        color: 0x4b5d7a,
        roughness: 0.6,
        metalness: 0.15
      })
    );
  }

  return new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x5a616b,
      roughness: 0.7,
      metalness: 0.1
    })
  );
}

function baseYForEntity(entity: WorldEntity): number {
  if (entity.type === "place") return 0.11;
  if (entity.type === "object") return 0.8;
  return 0.5;
}

function applyDescriptor(name: string, target: THREE.Mesh): void {
  const material = target.material;
  const standard = material instanceof THREE.MeshStandardMaterial ? material : null;

  if (name === "floating") {
    target.position.y += 1.6;
    if (standard) {
      standard.emissive = new THREE.Color(0x3e5666);
      standard.emissiveIntensity = Math.max(standard.emissiveIntensity, 0.35);
    }
  }

  if (name === "glass") {
    if (standard) {
      standard.transparent = true;
      standard.opacity = 0.35;
      standard.roughness = Math.min(standard.roughness, 0.12);
    }
  }

  if (name === "bright") {
    if (standard) {
      standard.emissive = new THREE.Color(0x9fd7ff);
      standard.emissiveIntensity = Math.max(standard.emissiveIntensity, 0.45);
    }
  }

  if (name === "dark") {
    if (standard) {
      standard.color.multiplyScalar(0.8);
      standard.emissiveIntensity = Math.min(standard.emissiveIntensity, 0.1);
    }
  }
}

function resizeRenderer(canvas: HTMLCanvasElement, force: boolean): void {
  if (!renderer || !camera) return;

  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 480;
  if (!force && width === lastSize.width && height === lastSize.height) return;
  lastSize = { width, height };
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function updateMovement(): void {
  if (!camera) return;

  const now = performance.now();
  const delta = lastFrame ? (now - lastFrame) / 1000 : 0;
  lastFrame = now;

  if (delta === 0) return;

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  right.y = 0;
  right.normalize();

  const desired = new THREE.Vector3();
  if (pressedKeys.has("KeyW")) desired.add(forward);
  if (pressedKeys.has("KeyS")) desired.addScaledVector(forward, -1);
  if (pressedKeys.has("KeyA")) desired.addScaledVector(right, -1);
  if (pressedKeys.has("KeyD")) desired.add(right);

  if (desired.lengthSq() > 0) {
    desired.normalize().multiplyScalar(MOVE_SPEED);
  }

  movementVelocity.lerp(desired, MOVE_DAMPING);
  camera.position.addScaledVector(movementVelocity, delta);

  const vertical = MOVE_SPEED * delta;
  if (pressedKeys.has("Space")) camera.position.y += vertical;
  if (pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight")) {
    camera.position.y -= vertical;
  }
}

function positionCameraAtStart(world: WorldModel, meshById: MeshMap): void {
  if (!camera) return;

  const firstPlace = world.entities.find((entity) => entity.type === "place");
  const targetMesh = firstPlace ? meshById.get(firstPlace.id) : undefined;

  if (targetMesh) {
    const target = targetMesh.position.clone();
    camera.position.set(target.x, target.y + 3, target.z + 9);
    camera.lookAt(target);
    syncAnglesToCamera();
    return;
  }

  let total = new THREE.Vector3(0, 0, 0);
  let count = 0;
  meshById.forEach((mesh) => {
    total.add(mesh.position);
    count += 1;
  });

  if (count === 0) return;
  const center = total.multiplyScalar(1 / count);
  camera.position.set(center.x, center.y + 3, center.z + 9);
  camera.lookAt(center);
  syncAnglesToCamera();
}

function syncAnglesToCamera(): void {
  if (!camera) return;
  yaw = camera.rotation.y;
  pitch = camera.rotation.x;
}

function centerWorld(group: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    group.position.x -= center.x;
    group.position.z -= center.z;
  }
}
