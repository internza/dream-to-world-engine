// @ts-expect-error - CDN ESM import is resolved by the browser at runtime.
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import type { WorldModel, WorldEntity } from "../core/transform.js";

type GroupMap = Map<string, THREE.Group>;

let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let worldGroup: THREE.Group | null = null;
let skyDome: THREE.Mesh | null = null;
let starfield: THREE.Points | null = null;
let ambientLight: THREE.AmbientLight | null = null;
let directionalLight: THREE.DirectionalLight | null = null;
let fillLight: THREE.DirectionalLight | null = null;
let rimLight: THREE.DirectionalLight | null = null;
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
const floatingGroups: Array<{ group: THREE.Group; baseY: number; phase: number }> = [];
const cloudJitters: Array<{ mesh: THREE.Mesh; base: THREE.Vector3; phase: number }> = [];
const cityEmissives: Array<{ material: THREE.MeshStandardMaterial; base: number; phase: number }> = [];
const FLOAT_AMPLITUDE = 0.45;
const FLOAT_SPEED = 0.65;

const BASE_AMBIENT = 0.4;
const BASE_DIRECTIONAL = 0.8;

export function initRenderer(canvas: HTMLCanvasElement): void {
  if (renderer) return;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x111a24, 18, 75);
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 140);
  camera.position.set(2.2, 5.6, 12.5);
  camera.lookAt(0, 1.2, 0);
  syncAnglesToCamera();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = 1.08;

  ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  directionalLight = new THREE.DirectionalLight(0xffffff, 1.45);
  directionalLight.position.set(6, 10, 4);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(1024, 1024);
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = 40;
  directionalLight.shadow.camera.left = -16;
  directionalLight.shadow.camera.right = 16;
  directionalLight.shadow.camera.top = 16;
  directionalLight.shadow.camera.bottom = -16;
  directionalLight.shadow.bias = -0.0004;

  fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
  fillLight.position.set(-6, 6, -4);

  rimLight = new THREE.DirectionalLight(0x9fd7ff, 0.3);
  rimLight.position.set(-10, 8, 10);

  scene.add(ambientLight, directionalLight, fillLight, rimLight);

  skyDome = createSkyDome(120, 0x05070e, 0x111a24);
  scene.add(skyDome);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 28),
    new THREE.MeshStandardMaterial({
      color: 0x151820,
      roughness: 0.92,
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
      updateFloating();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    }
  };

  animate();
}

export function renderWorld(world: WorldModel): void {
  if (!scene) return;

  disposeWorld();
  if (ambientLight) ambientLight.intensity = 0.3;
  if (directionalLight) directionalLight.intensity = 1.45;
  if (fillLight) fillLight.intensity = 0.35;
  if (rimLight) rimLight.intensity = 0.3;

  const signature = world.entities.map((entity) => entity.attributes.name).join("|");
  starfield = createStarfield(signature, 700, 90);
  scene.add(starfield);

  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const groupById: GroupMap = new Map();
  const entityById = new Map<string, WorldEntity>();
  floatingGroups.length = 0;
  cloudJitters.length = 0;
  cityEmissives.length = 0;

  world.entities.forEach((entity, index) => {
    entityById.set(entity.id, entity);
    const group = createGroupForEntity(entity);
    const x = index * 4.2;

    group.position.set(x, baseYForEntity(entity), 0);
    worldGroup?.add(group);
    groupById.set(entity.id, group);
  });

  positionCameraAtStart(world, groupById);

  world.relationships.forEach((relation) => {
    const fromEntity = entityById.get(relation.from);
    const toEntity = entityById.get(relation.to);
    const fromGroup = groupById.get(relation.from);
    const toGroup = groupById.get(relation.to);

    if (!fromEntity || !fromGroup || !toGroup || !toEntity) return;

    if (relation.type === "modifies" && fromEntity.type === "descriptor") {
      applyDescriptor(fromEntity.attributes.name, toGroup);
    }

    if (relation.type === "above") {
      fromGroup.position.y = toGroup.position.y + 4.5;
    }
  });

  setupFloatingGroups(groupById);

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
  floatingGroups.length = 0;
  cloudJitters.length = 0;
  cityEmissives.length = 0;

  if (starfield) {
    starfield.geometry.dispose();
    if (starfield.material instanceof THREE.Material) {
      starfield.material.dispose();
    }
    scene.remove(starfield);
    starfield = null;
  }
}

function createGroupForEntity(entity: WorldEntity): THREE.Group {
  const group = new THREE.Group();
  const name = entity.attributes.name;

  if (entity.type === "place" && name === "clouds") {
    const material = new THREE.MeshStandardMaterial({
      color: 0xf2f7ff,
      emissive: new THREE.Color(0xc8ddff),
      emissiveIntensity: 0.4,
      roughness: 0.55,
      metalness: 0,
      transparent: true,
      opacity: 0.78
    });
    const cloudSpecs = [
      { x: -1.2, y: 0.2, z: 0.4, r: 0.72 },
      { x: -0.4, y: 0.28, z: -0.2, r: 0.95 },
      { x: 0.5, y: 0.18, z: 0.2, r: 0.82 },
      { x: 1.1, y: 0.08, z: -0.3, r: 0.62 },
      { x: 0.1, y: 0.38, z: 0.8, r: 0.52 }
    ];

    cloudSpecs.forEach((spec) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(spec.r, 18, 18),
        material
      );
      mesh.position.set(spec.x, spec.y, spec.z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
      cloudJitters.push({
        mesh,
        base: mesh.position.clone(),
        phase: spec.x * 1.7 + spec.z * 1.3
      });
    });

    return group;
  }

  if (entity.type === "place" && name === "city") {
    const material = new THREE.MeshStandardMaterial({
      color: 0x2b2f36,
      emissive: new THREE.Color(0x2a3444),
      emissiveIntensity: 0.5,
      roughness: 0.5,
      metalness: 0.25
    });

    for (let x = 0; x < 3; x += 1) {
      for (let z = 0; z < 3; z += 1) {
        const height = 0.9 + x * 0.35 + z * 0.28;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, height, 0.55),
          material
        );
        mesh.position.set((x - 1) * 0.7, height / 2, (z - 1) * 0.7);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        cityEmissives.push({
          material,
          base: material.emissiveIntensity,
          phase: (x + z) * 0.6
        });
      }
    }

    return group;
  }

  if (entity.type === "place" && name === "beach") {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.18, 6.4),
      new THREE.MeshStandardMaterial({
        color: 0xd6c28a,
        roughness: 0.95,
        metalness: 0.02
      })
    );
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  if (entity.type === "object" && name === "towers") {
    const material = new THREE.MeshStandardMaterial({
      color: 0x4b5d7a,
      roughness: 0.38,
      metalness: 0.2
    });
    const towerSpecs = [
      { x: -0.6, z: 0.2, h: 2.2 },
      { x: 0.1, z: -0.1, h: 2.8 },
      { x: 0.8, z: 0.4, h: 2.4 }
    ];

    towerSpecs.forEach((spec) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, spec.h, 0.7),
        material
      );
      mesh.position.set(spec.x, spec.h / 2, spec.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    return group;
  }

  if (entity.type === "place") {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.22, 3.2),
      new THREE.MeshStandardMaterial({
        color: 0x2c5b4c,
        roughness: 0.85,
        metalness: 0.05
      })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  if (entity.type === "object") {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.6, 1.1),
      new THREE.MeshStandardMaterial({
        color: 0x4b5d7a,
        roughness: 0.6,
        metalness: 0.15
      })
    );
    mesh.position.y = 0.8;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x5a616b,
      roughness: 0.7,
      metalness: 0.1
    })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function baseYForEntity(entity: WorldEntity): number {
  const name = entity.attributes.name;
  if (entity.type === "place" && name === "clouds") return 1.1;
  if (entity.type === "place" && name === "beach") return 0.05;
  if (entity.type === "place") return 0.11;
  if (entity.type === "object") return 0.8;
  return 0.5;
}

function applyDescriptor(name: string, target: THREE.Group): void {
  if (name === "floating") {
    target.position.y += 2.2;
    target.userData.floating = true;
  }

  if (name === "bright" && ambientLight) {
    ambientLight.intensity = Math.min(0.4, ambientLight.intensity + 0.05);
  }

  target.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const material = obj.material;
    if (Array.isArray(material)) return;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    if (name === "glass") {
      material.transparent = true;
      material.opacity = 0.28;
      material.roughness = Math.min(material.roughness, 0.08);
      material.color = new THREE.Color(0x9bc1ff);
    }

    if (name === "bright") {
      material.emissive = new THREE.Color(0x9fd7ff);
      material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.45);
    }

    if (name === "dark") {
      material.color.multiplyScalar(0.8);
      material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.1);
    }

    if (name === "bright" || name === "floating") {
      addGlow(mesh, 0x9fc7ff, 0.2);
    }
  });
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

function updateFloating(): void {
  if (floatingGroups.length === 0) return;
  const time = performance.now() / 1000;

  floatingGroups.forEach(({ group, baseY, phase }) => {
    group.position.y = baseY + Math.sin(time * FLOAT_SPEED + phase) * FLOAT_AMPLITUDE;
    group.rotation.y = Math.sin(time * 0.15 + phase) * 0.1;
  });

  cloudJitters.forEach(({ mesh, base, phase }) => {
    mesh.position.y = base.y + Math.sin(time * 0.4 + phase) * 0.06;
  });

  cityEmissives.forEach(({ material, base, phase }) => {
    material.emissiveIntensity = base + Math.sin(time * 0.35 + phase) * 0.12;
  });
}

function positionCameraAtStart(world: WorldModel, groupById: GroupMap): void {
  if (!camera) return;

  const firstPlace = world.entities.find((entity) => entity.type === "place");
  const targetGroup = firstPlace ? groupById.get(firstPlace.id) : undefined;

  if (targetGroup) {
    const target = targetGroup.position.clone();
    camera.position.set(target.x + 1.5, target.y + 3.2, target.z + 9.5);
    camera.lookAt(target.x, target.y + 1, target.z);
    syncAnglesToCamera();
    return;
  }

  let total = new THREE.Vector3(0, 0, 0);
  let count = 0;
  groupById.forEach((group) => {
    total.add(group.position);
    count += 1;
  });

  if (count === 0) return;
  const center = total.multiplyScalar(1 / count);
  camera.position.set(center.x + 1.5, center.y + 3.2, center.z + 9.5);
  camera.lookAt(center.x, center.y + 1, center.z);
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

function setupFloatingGroups(groupById: GroupMap): void {
  let index = 0;
  groupById.forEach((group) => {
    if (!group.userData.floating) return;
    floatingGroups.push({
      group,
      baseY: group.position.y,
      phase: index * 0.6
    });
    index += 1;
  });
}

function createSkyGradient(topColor: number, bottomColor: number): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const fallback = new THREE.Texture();
    fallback.needsUpdate = true;
    return fallback;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, `#${topColor.toString(16).padStart(6, "0")}`);
  gradient.addColorStop(1, `#${bottomColor.toString(16).padStart(6, "0")}`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSkyDome(radius: number, topColor: number, bottomColor: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 32, 24);
  geometry.scale(-1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: createSkyGradient(topColor, bottomColor)
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.rotation.y = Math.PI / 2;
  return dome;
}

function createStarfield(seedText: string, count: number, radius: number): THREE.Points {
  const rng = seededRandom(seedText);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const u = rng();
    const v = rng();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.7 + rng() * 0.3);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);

    const idx = i * 3;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xcad7ff,
    size: 0.5,
    transparent: true,
    opacity: 0.35,
    depthWrite: false
  });
  return new THREE.Points(geometry, material);
}

function seededRandom(text: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addGlow(mesh: THREE.Mesh, color: number, opacity: number): void {
  if (mesh.userData.glow) return;
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const glow = new THREE.Mesh(mesh.geometry, material);
  glow.scale.set(1.12, 1.12, 1.12);
  glow.userData.glow = true;
  mesh.userData.glow = glow;
  mesh.add(glow);
}
