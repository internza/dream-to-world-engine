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
let animationId: number | null = null;
let canvasRef: HTMLCanvasElement | null = null;
let yaw = 0;
let pitch = 0;
let lastFrame = 0;
let pointerLocked = false;
const pressedKeys = new Set<string>();
const MOVE_SPEED = 6;
const LOOK_SENSITIVITY = 0.002;

const BASE_AMBIENT = 0.4;
const BASE_DIRECTIONAL = 0.8;

export function initRenderer(canvas: HTMLCanvasElement): void {
  if (renderer) return;

  canvasRef = canvas;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 6, 12);
  camera.lookAt(0, 0, 0);
  syncAnglesToCamera();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);

  ambientLight = new THREE.AmbientLight(0xffffff, BASE_AMBIENT);
  directionalLight = new THREE.DirectionalLight(0xffffff, BASE_DIRECTIONAL);
  directionalLight.position.set(5, 8, 6);

  scene.add(ambientLight, directionalLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({ color: 0x3a3a3a })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const resize = () => resizeRenderer(canvas);
  window.addEventListener("resize", resize);
  resizeRenderer(canvas);

  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    pointerLocked = document.pointerLockElement === canvas;
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
  if (ambientLight) ambientLight.intensity = BASE_AMBIENT;
  if (directionalLight) directionalLight.intensity = BASE_DIRECTIONAL;

  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const meshById: MeshMap = new Map();
  const entityById = new Map<string, WorldEntity>();

  world.entities.forEach((entity, index) => {
    entityById.set(entity.id, entity);
    const mesh = createMeshForEntity(entity);
    const x = index * 3;

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
      fromMesh.position.y = toMesh.position.y + 3;
    }
  });
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
      new THREE.BoxGeometry(2.6, 0.2, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x2f6f3e })
    );
  }

  if (entity.type === "object") {
    return new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xa3a3a3 })
    );
  }

  return new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x4a90e2 })
  );
}

function baseYForEntity(entity: WorldEntity): number {
  if (entity.type === "place") return 0.1;
  if (entity.type === "object") return 0.5;
  return 0.5;
}

function applyDescriptor(name: string, target: THREE.Mesh): void {
  const material = target.material;

  if (name === "floating") {
    target.position.y += 2;
  }

  if (name === "glass") {
    if (!Array.isArray(material)) {
      material.transparent = true;
      material.opacity = 0.35;
    }
  }

  if (name === "bright") {
    if (!Array.isArray(material) && "emissiveIntensity" in material) {
      material.emissive = new THREE.Color(0xffffff);
      material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.8);
    } else if (directionalLight) {
      directionalLight.intensity = Math.min(
        BASE_DIRECTIONAL + 0.2,
        directionalLight.intensity + 0.2
      );
    }
  }

  if (name === "dark") {
    if (!Array.isArray(material) && "emissiveIntensity" in material) {
      material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.1);
    } else if (directionalLight) {
      directionalLight.intensity = Math.max(
        BASE_DIRECTIONAL - 0.2,
        directionalLight.intensity - 0.2
      );
    }
  }
}

function resizeRenderer(canvas: HTMLCanvasElement): void {
  if (!renderer || !camera) return;

  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 480;
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

  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const velocity = MOVE_SPEED * delta;

  if (pressedKeys.has("KeyW")) camera.position.addScaledVector(forward, velocity);
  if (pressedKeys.has("KeyS")) camera.position.addScaledVector(forward, -velocity);
  if (pressedKeys.has("KeyA")) camera.position.addScaledVector(right, -velocity);
  if (pressedKeys.has("KeyD")) camera.position.addScaledVector(right, velocity);
  if (pressedKeys.has("Space")) camera.position.y += velocity;
  if (pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight")) {
    camera.position.y -= velocity;
  }
}

function positionCameraAtStart(world: WorldModel, meshById: MeshMap): void {
  if (!camera) return;

  const firstPlace = world.entities.find((entity) => entity.type === "place");
  const targetMesh = firstPlace ? meshById.get(firstPlace.id) : undefined;

  if (targetMesh) {
    const target = targetMesh.position.clone();
    camera.position.set(target.x, target.y + 3, target.z + 8);
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
  camera.position.set(center.x, center.y + 3, center.z + 8);
  camera.lookAt(center);
  syncAnglesToCamera();
}

function syncAnglesToCamera(): void {
  if (!camera) return;
  yaw = camera.rotation.y;
  pitch = camera.rotation.x;
}
