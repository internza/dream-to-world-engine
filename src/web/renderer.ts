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
const CAMERA_FLOOR = 0.6;
const DEBUG_VIS = true;
let worldSeed = "";
let hasOcean = false;
let cityMaxHeight = 0;

const BASE_AMBIENT = 0.4;
const BASE_DIRECTIONAL = 0.8;

export function initRenderer(canvas: HTMLCanvasElement): void {
  if (renderer) return;

  scene = new THREE.Scene();
  if (DEBUG_VIS) {
    scene.fog = null;
    scene.background = new THREE.Color(0x1a1f2a);
  } else {
    scene.fog = new THREE.Fog(0x151f2c, 18, 75);
  }
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 140);
  camera.position.set(2.6, 5.1, 12.8);
  camera.lookAt(0, 1.5, 0);
  syncAnglesToCamera();

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = 1.08;

  ambientLight = new THREE.AmbientLight(0xffffff, DEBUG_VIS ? 1 : 0.35);
  directionalLight = new THREE.DirectionalLight(0xffe2c2, DEBUG_VIS ? 2.5 : 1.65);
  directionalLight.position.set(DEBUG_VIS ? 10 : 6, DEBUG_VIS ? 20 : 10, DEBUG_VIS ? 10 : 4);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(1024, 1024);
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = DEBUG_VIS ? 80 : 40;
  directionalLight.shadow.camera.left = -24;
  directionalLight.shadow.camera.right = 24;
  directionalLight.shadow.camera.top = 24;
  directionalLight.shadow.camera.bottom = -24;
  directionalLight.shadow.bias = -0.0004;

  fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
  fillLight.position.set(-6, 6, -4);

  rimLight = new THREE.DirectionalLight(0x7fb5ff, 0.4);
  rimLight.position.set(-10, 8, 10);

  scene.add(ambientLight, directionalLight, fillLight, rimLight);

  if (!DEBUG_VIS) {
    skyDome = createSkyDome(120, 0x05070e, 0x1b2634);
    scene.add(skyDome);
  }

  const axes = new THREE.AxesHelper(5);
  const grid = new THREE.GridHelper(50, 50, 0x3a4a5a, 0x232a35);
  scene.add(axes, grid);

  const resize = () => resizeRenderer(canvas, true);
  window.addEventListener("resize", resize);
  resizeRenderer(canvas, true);

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
  if (ambientLight) ambientLight.intensity = DEBUG_VIS ? 1 : 0.35;
  if (directionalLight) directionalLight.intensity = DEBUG_VIS ? 2.5 : 1.65;
  if (fillLight) fillLight.intensity = 0.35;
  if (rimLight) rimLight.intensity = 0.4;

  const signature = world.entities.map((entity) => entity.attributes.name).join("|");
  const rng = seededRandom(signature);
  worldSeed = signature;
  hasOcean = world.entities.some((entity) => entity.attributes.name === "ocean");
  cityMaxHeight = 0;
  if (!DEBUG_VIS) {
    starfield = createStarfield(signature, 700, 90);
    scene.add(starfield);
  }

  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x151820,
      roughness: 0.92,
      metalness: 0.05
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  worldGroup.add(ground);

  const groupById: GroupMap = new Map();
  const entityById = new Map<string, WorldEntity>();
  floatingGroups.length = 0;
  cloudJitters.length = 0;
  cityEmissives.length = 0;

  const cityEntity = world.entities.find((entity) => entity.attributes.name === "city");
  if (cityEntity) {
    entityById.set(cityEntity.id, cityEntity);
    const group = createGroupForEntity(cityEntity);
    worldGroup?.add(group);
    groupById.set(cityEntity.id, group);
  }

  world.entities.forEach((entity) => {
    if (entity.id === cityEntity?.id) return;
    entityById.set(entity.id, entity);
    const group = createGroupForEntity(entity);
    worldGroup?.add(group);
    groupById.set(entity.id, group);
  });

  const placed = new Map<string, THREE.Vector3>();
  const placedPositions: THREE.Vector3[] = [];
  const minSpacing = 3.2;

  const pushOut = (pos: THREE.Vector3) => {
    let attempts = 0;
    while (
      placedPositions.some((existing) => existing.distanceTo(pos) < minSpacing) &&
      attempts < 6
    ) {
      const dir = pos.clone().setY(0);
      if (dir.lengthSq() < 0.001) {
        dir.set(1, 0, 0);
      }
      dir.normalize();
      pos.addScaledVector(dir, minSpacing * 0.6);
      attempts += 1;
    }
  };

  const placeEntity = (entity: WorldEntity, pos: THREE.Vector3) => {
    pushOut(pos);
    placed.set(entity.id, pos);
    placedPositions.push(pos);
  };

  const anchor =
    world.entities.find((entity) => entity.attributes.name === "city") ??
    world.entities.find((entity) => entity.type === "place") ??
    world.entities[0];

  if (anchor) {
    placeEntity(anchor, new THREE.Vector3(0, baseYForEntity(anchor), 0));
  }

  const otherPlaces = world.entities.filter(
    (entity) => entity.type === "place" && entity.id !== anchor?.id
  );
  const ringRadius = 10 + rng() * 6;
  const step = otherPlaces.length > 0 ? (Math.PI * 2) / otherPlaces.length : 0;

  otherPlaces.forEach((entity, index) => {
    const angle = step * index + (rng() - 0.5) * 0.4;
    const radius = ringRadius + (rng() - 0.5) * 2;
    const pos = new THREE.Vector3(
      Math.cos(angle) * radius,
      baseYForEntity(entity),
      Math.sin(angle) * radius
    );
    placeEntity(entity, pos);
  });

  const locateRelation = (entityId: string) =>
    world.relationships.find(
      (relation) => relation.type === "located_in" && relation.from === entityId
    );

  world.entities.forEach((entity) => {
    if (placed.has(entity.id)) return;
    const located = locateRelation(entity.id);
    const base = located ? placed.get(located.to) : undefined;
    const anchorPos = anchor ? placed.get(anchor.id) : undefined;
    const origin = base ?? anchorPos ?? new THREE.Vector3();

    const angle = rng() * Math.PI * 2;
    const radius = entity.type === "object" ? 2.8 + rng() * 2.4 : 3.2 + rng() * 3.2;
    const pos = new THREE.Vector3(
      origin.x + Math.cos(angle) * radius,
      baseYForEntity(entity),
      origin.z + Math.sin(angle) * radius
    );
    placeEntity(entity, pos);
  });

  const cityPos = anchor ? placed.get(anchor.id) : undefined;
  if (cityPos) {
    world.entities.forEach((entity) => {
      if (!entity.attributes.name.includes("tower")) return;
      const radius = 3.5 + rng() * 1.5;
      const angle = rng() * Math.PI * 2;
      const pos = new THREE.Vector3(
        cityPos.x + Math.cos(angle) * radius,
        baseYForEntity(entity),
        cityPos.z + Math.sin(angle) * radius
      );
      placed.set(entity.id, pos);
      placedPositions.push(pos);
    });
  }

  placed.forEach((pos, id) => {
    const group = groupById.get(id);
    if (group) group.position.copy(pos);
  });


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
      const verticalGap = 4.5;
      fromGroup.position.x = toGroup.position.x;
      fromGroup.position.z = toGroup.position.z;
      fromGroup.position.y = toGroup.position.y + verticalGap;
    }
  });

  setupFloatingGroups(groupById);

  const worldBounds = new THREE.Box3().setFromObject(worldGroup);
  if (worldBounds.isEmpty()) {
    console.log("World root is empty");
    return;
  }

  const center = worldBounds.getCenter(new THREE.Vector3());
  worldGroup.position.sub(center);

  const framedBounds = new THREE.Box3().setFromObject(worldGroup);
  const framedCenter = framedBounds.getCenter(new THREE.Vector3());
  const size = framedBounds.getSize(new THREE.Vector3());
  console.log("World bounds center", framedCenter, "size", size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (camera) {
    camera.position.set(
      framedCenter.x + maxDim,
      framedCenter.y + maxDim * 0.6,
      framedCenter.z + maxDim
    );
    camera.lookAt(framedCenter);
    syncAnglesToCamera();
  }
}

export function disposeWorld(): void {
  if (!scene || !worldGroup) return;

  worldGroup.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        (obj.material as THREE.Material[]).forEach((material: THREE.Material) =>
          material.dispose()
        );
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
  const name = entity.attributes.name;
  const rng = seededRandom(`${worldSeed}|${name}`);
  const generator = dictionaryGenerators[name];
  if (generator) {
    return generator(rng);
  }

  if (entity.type === "place") return createPlatformGroup();
  if (entity.type === "object") return createBoxGroup();
  return createUnknownGroup();
}

function baseYForEntity(entity: WorldEntity): number {
  const name = entity.attributes.name;
  if (entity.type === "place" && (name === "clouds" || name === "cloud")) return 1.1;
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

  target.traverse((obj: THREE.Object3D) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mesh = obj;
    const material = mesh.material;
    if (Array.isArray(material)) return;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;

    if (name === "glass") {
      material.transparent = true;
      material.opacity = 0.38;
      material.roughness = Math.min(material.roughness, 0.05);
      material.metalness = Math.max(material.metalness, 0.35);
      material.color = new THREE.Color(0x8fbfff);
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
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  renderer.setPixelRatio(pixelRatio);
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

  camera.position.y = Math.max(camera.position.y, CAMERA_FLOOR);
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

function positionCameraAtStart(anchor: THREE.Vector3, rng: () => number): void {
  if (!camera) return;

  const angle = rng() * Math.PI * 2;
  const radius = 7 + rng() * 2.5;
  const target = anchor.clone();

  camera.position.set(
    target.x + Math.cos(angle) * radius,
    Math.max(target.y + 2.6, CAMERA_FLOOR + 0.6),
    target.z + Math.sin(angle) * radius
  );
  camera.lookAt(target.x, target.y + 1.3, target.z);
  syncAnglesToCamera();
}

function syncAnglesToCamera(): void {
  if (!camera) return;
  yaw = camera.rotation.y;
  pitch = camera.rotation.x;
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

const dictionaryGenerators: Record<string, (rng: () => number) => THREE.Group> = {
  city: createCityGroup,
  clouds: createCloudGroup,
  cloud: createCloudGroup,
  towers: createTowerGroup,
  tower: createTowerGroup,
  beach: createBeachGroup
};

function createCityGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x3a3f48,
    emissive: new THREE.Color(0x3b4a63),
    emissiveIntensity: 0.55,
    roughness: 0.5,
    metalness: 0.25
  });

  const halo = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 3.2, 6.4),
    new THREE.MeshBasicMaterial({
      color: 0x7ca7ff,
      transparent: true,
      opacity: 0.07
    })
  );
  halo.position.set(0, 1.6, 0);
  group.add(halo);

  const gridSize = 6;
  const spacing = 0.9;
  const targetBuildings = 20 + Math.floor(rng() * 21);
  let count = 0;

  for (let x = 0; x < gridSize; x += 1) {
    for (let z = 0; z < gridSize; z += 1) {
      if (count >= targetBuildings) break;
      if (rng() < 0.18) continue;
      if (x === 2 && z === 2) continue;

      const width = 0.45 + rng() * 0.35;
      const depth = 0.45 + rng() * 0.35;
      const height = 0.8 + rng() * 2.4 + (rng() < 0.12 ? 2.2 : 0);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material
      );
      mesh.position.set(
        (x - (gridSize - 1) / 2) * spacing,
        height / 2,
        (z - (gridSize - 1) / 2) * spacing
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      cityEmissives.push({
        material,
        base: material.emissiveIntensity,
        phase: (x + z) * 0.6
      });
      cityMaxHeight = Math.max(cityMaxHeight, height);
      count += 1;
    }
  }

  for (let i = 0; i < 3; i += 1) {
    const height = 4 + rng() * 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, height, 0.6),
      material
    );
    mesh.position.set(
      (rng() - 0.5) * 3.5,
      height / 2,
      (rng() - 0.5) * 3.5
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    cityMaxHeight = Math.max(cityMaxHeight, height);
  }

  return group;
}

function createCloudGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xf2f7ff,
    emissive: new THREE.Color(0xc8ddff),
    emissiveIntensity: 0.42,
    roughness: 0.55,
    metalness: 0,
    transparent: true,
    opacity: 0.8
  });
  const count = 8 + Math.floor(rng() * 8);

  for (let i = 0; i < count; i += 1) {
    const radius = 0.45 + rng() * 0.6;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 18, 18),
      material
    );
    mesh.position.set(
      (rng() - 0.5) * 3,
      0.2 + rng() * 0.4,
      (rng() - 0.5) * 3
    );
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    cloudJitters.push({
      mesh,
      base: mesh.position.clone(),
      phase: i * 0.5 + rng()
    });
  }

  return group;
}

function createTowerGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0x4b5d7a,
    roughness: 0.3,
    metalness: 0.28
  });
  const count = 2 + Math.floor(rng() * 5);
  const targetHeight = cityMaxHeight > 0 ? cityMaxHeight * 1.5 : 4;

  for (let i = 0; i < count; i += 1) {
    const height = targetHeight * (0.85 + rng() * 0.3);
    const width = 0.5 + rng() * 0.3;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, width),
      material
    );
    const taper = 0.85 + rng() * 0.1;
    mesh.scale.x = taper;
    mesh.scale.z = taper;
    mesh.position.set(
      (rng() - 0.5) * 2,
      height / 2,
      (rng() - 0.5) * 2
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

function createBeachGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.18, 6.5),
    new THREE.MeshStandardMaterial({
      color: 0xd6c28a,
      roughness: 0.95,
      metalness: 0.02
    })
  );
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);

  if (hasOcean) {
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.08, 4),
      new THREE.MeshStandardMaterial({
        color: 0x2b4b7a,
        roughness: 0.4,
        metalness: 0.2
      })
    );
    water.position.set(0, -0.05, -5.2);
    water.receiveShadow = true;
    group.add(water);
  }

  return group;
}

function createPlatformGroup(): THREE.Group {
  const group = new THREE.Group();
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

function createBoxGroup(): THREE.Group {
  const group = new THREE.Group();
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

function createUnknownGroup(): THREE.Group {
  const group = new THREE.Group();
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
