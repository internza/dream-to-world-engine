// @ts-expect-error - CDN ESM import is resolved by the browser at runtime.
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import type { WorldModel, WorldEntity, SemanticTags, ScaleType, EntityType, EnvironmentType } from "../core/transform.js";
import { resolveSurfaceProfile } from "./surface.js";
import type { SurfaceProfile } from "./surface.js";
import { accumulateFootstep, resetFootstepAccumulator, setFootstepSurface, playInteractionSound } from "./audio.js";

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
let hemiLight: THREE.HemisphereLight | null = null;
let animationId: number | null = null;
let canvasWrap: HTMLElement | null = null;
let yaw = 0;
let pitch = 0;
let lastFrame = 0;
let pointerLocked = false;
let controlsEnabled = false;
const pressedKeys = new Set<string>();
const MOVE_SPEED = 18;
const SPRINT_MULTIPLIER = 2.4;
const LOOK_SENSITIVITY = 0.002;
const MOVE_DAMPING = 0.15;
const movementVelocity = new THREE.Vector3();
let lastSize = { width: 0, height: 0 };
const floatingGroups: Array<{ group: THREE.Group; baseY: number; phase: number }> = [];
const cloudJitters: Array<{ mesh: THREE.Mesh; base: THREE.Vector3; phase: number }> = [];
const cityEmissives: Array<{ material: THREE.MeshStandardMaterial; base: number; phase: number }> = [];
const oceanWaveMeshes: THREE.Mesh[] = [];
const FLOAT_AMPLITUDE = 0.45;
const FLOAT_SPEED = 0.65;
const PLAYER_EYE_HEIGHT = 1.7;
const PLAYER_HEIGHT = 1.8;
const DEBUG_VIS = false;

// ── Player embodiment & camera mode ──────────────────────────────────
type CameraMode = "first" | "third";
let cameraMode: CameraMode = "first";
let playerPos = new THREE.Vector3(0, 0, 0); // feet position
let fpArms: THREE.Group | null = null;
let tpAvatar: THREE.Group | null = null;
const TP_OFFSET = new THREE.Vector3(0, 3, 7); // behind + above

// ── Human-scale reference constants ──────────────────────────────────
// All generators use these so the world feels walkable at PLAYER_EYE_HEIGHT.
const SCALE = {
  /** Typical city building */ buildingW: { min: 3, max: 7 },  buildingH: { min: 5, max: 30 },
  /** Landmark tower */       towerH:    { min: 20, max: 40 },
  /** City grid */             citySpacing: 8, cityGrid: 7,
  /** City footprint */        citySpread: 35,
  /** Castle keep */           castleKeep: 14, castleTower: { min: 16, max: 24 },
  /** Tree */                  trunkH: { min: 5, max: 10 }, crownR: { min: 2.5, max: 5 },
  /** Forest spread */         forestSpread: 35,
  /** Cloud blob */            cloudR: { min: 4, max: 10 }, cloudSpread: 30,
  /** Cloud platform (when supporting city) */ cloudPlatR: { min: 14, max: 28 }, cloudPlatSpread: 60,
  /** Bridge */                bridgeSpan: 18, bridgeDeck: 4.5, bridgePillar: 4,
  /** Pillar */                pillarH: { min: 6, max: 14 },
  /** Statue */                statueH: 4.5,
  /** Gate */                  gateH: 7, gateW: 5,
  /** Ruins spread */          ruinsH: { min: 2, max: 7 }, ruinsSpread: 20,
  /** Crystal */               crystalH: { min: 2, max: 6 },
  /** Stone */                 stoneR: { min: 0.6, max: 1.8 },
  /** Fragment */              fragS: { min: 0.4, max: 1 }, fragSpread: 10,
  /** Ocean */                 oceanR: 320,
  /** Beach */                 beachW: 50, beachD: 35,
  /** Mountain */              mountainH: { min: 25, max: 50 }, mountainR: { min: 14, max: 24 },
  /** Dream zone */            dreamR: 16,
  /** Platform fallback */     platSize: 12,
  /** Generic box */           boxH: 2.4, boxW: 1.6,
  /** Ring radius */           ringRadius: { min: 40, max: 70 },
  /** Min spacing */           minSpacing: 12,
  /** Object orbit */          objectOrbit: { min: 10, max: 20 },
  /** Tower orbit */           towerOrbit: { min: 12, max: 22 },
};
let worldSeed = "";
let hasOcean = false;
let cityMaxHeight = 0;
let cloudSupportsCity = false;

// ── World streaming (chunk system) ───────────────────────────────────
const CHUNK_SIZE = 80;
const LOAD_RADIUS = 2;   // chunks around player
const UNLOAD_RADIUS = 4; // chunks beyond this get removed
interface Chunk {
  key: string;
  cx: number;
  cz: number;
  group: THREE.Group;
}
const loadedChunks = new Map<string, Chunk>();
let activeSemantics: SemanticTags | null = null;
let streamingEnabled = false;
let lastPlayerChunkX = 0;
let lastPlayerChunkZ = 0;
let activeScaleMultiplier = 1.0;

type SkyMode = "day" | "sunset" | "night" | "storm" | "surreal";
let skyCloudGroup: THREE.Group | null = null;
let celestialGroup: THREE.Group | null = null;
let weatherRain: THREE.Points | null = null;
let weatherSnow: THREE.Points | null = null;
let thunderActive = false;
let thunderTimer = 0;
let currentSurfaceProfile: SurfaceProfile = {
  surface: "generic", groundColor: 0x1a1e28, groundRoughness: 0.94, bobIntensity: 0.6, stepInterval: 0.48
};
let bobPhase = 0;
let isWalking = false;

// ── Physics ──────────────────────────────────────────────────────────
const GRAVITY = 28;
const JUMP_FORCE = 10;
let playerVelY = 0;
let isGrounded = true;

// ── Interaction & raycasting ─────────────────────────────────────────
const raycaster = new THREE.Raycaster();
raycaster.far = 20;
const screenCenter = new THREE.Vector2(0, 0);
let lookedAtObject: THREE.Object3D | null = null;
let lookedAtOriginalEmissive: THREE.Color | null = null;
let lookedAtOriginalIntensity = 0;

// ── Collision ────────────────────────────────────────────────────────
interface CollisionBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
  isCloud: boolean;
}
const collisionBoxes: CollisionBox[] = [];

// ── Gameplay state ───────────────────────────────────────────────────
const discoveredLandmarks = new Set<string>();

// ── UI element refs (set at init) ────────────────────────────────────
let interactionHint: HTMLElement | null = null;
let feedbackText: HTMLElement | null = null;
let discoveryText: HTMLElement | null = null;
let feedbackTimer = 0;

const BASE_AMBIENT = 0.4;
const BASE_DIRECTIONAL = 0.8;

export function initRenderer(canvas: HTMLCanvasElement): void {
  if (renderer) return;

  scene = new THREE.Scene();
  if (DEBUG_VIS) {
    scene.fog = null;
    scene.background = new THREE.Color(0x1a1f2a);
  } else {
    scene.fog = new THREE.Fog(0x1b2634, 40, 300);
  }
  camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1200);
  camera.position.set(2.6, 5.1, 12.8);
  camera.lookAt(0, 1.5, 0);
  syncAnglesToCamera();

  // Player embodiment
  fpArms = buildFPArms();
  camera.add(fpArms);
  scene.add(camera); // needed so camera children render
  tpAvatar = buildTPAvatar();
  scene.add(tpAvatar);
  playerPos.set(camera.position.x, 0, camera.position.z);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.physicallyCorrectLights = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMappingExposure = 1.08;

  ambientLight = new THREE.AmbientLight(0xffffff, DEBUG_VIS ? 1 : 0.35);
  directionalLight = new THREE.DirectionalLight(0xffe2c2, DEBUG_VIS ? 2.5 : 1.65);
  directionalLight.position.set(DEBUG_VIS ? 20 : 15, DEBUG_VIS ? 40 : 25, DEBUG_VIS ? 20 : 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = DEBUG_VIS ? 120 : 80;
  directionalLight.shadow.camera.left = -50;
  directionalLight.shadow.camera.right = 50;
  directionalLight.shadow.camera.top = 50;
  directionalLight.shadow.camera.bottom = -50;
  directionalLight.shadow.bias = -0.0004;

  fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
  fillLight.position.set(-6, 6, -4);

  rimLight = new THREE.DirectionalLight(0x7fb5ff, 0.4);
  rimLight.position.set(-10, 8, 10);

  hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x362a1a, 0.4);
  scene.add(ambientLight, directionalLight, fillLight, rimLight, hemiLight);

  if (!DEBUG_VIS) {
    skyDome = createSkyDome(500, 0x05070e, 0x1b2634);
    scene.add(skyDome);
  }

  const resize = () => resizeRenderer(canvas, true);
  window.addEventListener("resize", resize);
  resizeRenderer(canvas, true);

  canvasWrap = canvas.closest(".canvas-wrap");

  // UI overlay refs
  interactionHint = document.getElementById("interaction-hint");
  feedbackText = document.getElementById("feedback-text");
  discoveryText = document.getElementById("discovery-text");

  canvas.addEventListener("click", () => {
    canvas.requestPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    pointerLocked = document.pointerLockElement === canvas;
    controlsEnabled = pointerLocked;
    if (!pointerLocked) pressedKeys.clear();
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
    // Camera orientation applied in updateMovement per camera mode
  });

  document.addEventListener("keydown", (event) => {
    if (!controlsEnabled) return;
    pressedKeys.add(event.code);
    if (["Space", "ShiftLeft", "ShiftRight"].includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === "KeyV") toggleCameraMode();
    if (event.code === "KeyE") triggerInteraction();
    if (event.code === "Space" && isGrounded) {
      playerVelY = JUMP_FORCE;
      isGrounded = false;
    }
  });

  document.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.code);
  });

  const animate = () => {
    if (renderer && scene && camera) {
      const now = performance.now();
      const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
      lastFrame = now;
      resizeRenderer(canvas, false);
      updateMovement(dt);
      updateInteraction();
      checkProximityDiscovery();
      updateFloating();
      updateWeather(dt);
      updateStreaming();
      // Keep sky dome and celestials centered on camera
      if (skyDome && camera) skyDome.position.copy(camera.position);
      if (celestialGroup && camera) celestialGroup.position.copy(camera.position);
      if (starfield && camera) starfield.position.copy(camera.position);
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    }
  };

  animate();
}

export function renderWorld(world: WorldModel): void {
  if (!scene) return;

  disposeWorld();

  const signature = world.entities.map((entity) => entity.attributes.name).join("|");
  const rng = seededRandom(signature);
  worldSeed = signature;
  hasOcean = world.entities.some((entity) => entity.attributes.name === "ocean");
  cityMaxHeight = 0;

  // Store semantics for streaming & scale
  activeSemantics = world.semantics;
  activeScaleMultiplier = scaleMultiplierForSemantics(world.semantics.scale);
  streamingEnabled = true;
  loadedChunks.clear();
  lastPlayerChunkX = 0;
  lastPlayerChunkZ = 0;

  // Detect relationship-aware scaling: city above clouds
  cloudSupportsCity = world.relationships.some((r) => {
    if (r.type !== "above") return false;
    const fromName = world.entities.find((e) => e.id === r.from)?.attributes.name;
    const toName = world.entities.find((e) => e.id === r.to)?.attributes.name;
    return (fromName === "city" && (toName === "cloud" || toName === "clouds"));
  });

  // Resolve and apply sky profile
  const skyProfile = resolveSkyProfile(world);
  applySkyProfile(skyProfile, signature, rng);

  // Resolve surface profile
  currentSurfaceProfile = resolveSurfaceProfile(world);
  setFootstepSurface(currentSurfaceProfile.surface, currentSurfaceProfile.stepInterval);
  resetFootstepAccumulator();

  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(400, 64),
    new THREE.MeshStandardMaterial({
      color: currentSurfaceProfile.groundColor,
      roughness: currentSurfaceProfile.groundRoughness,
      metalness: 0.02,
      side: THREE.DoubleSide
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
  oceanWaveMeshes.length = 0;

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
    if (entity.type === "descriptor") return;
    const group = createGroupForEntity(entity);
    worldGroup?.add(group);
    groupById.set(entity.id, group);
  });

  const placed = new Map<string, THREE.Vector3>();
  const placedPositions: THREE.Vector3[] = [];
  const minSpacing = SCALE.minSpacing;

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
  const ringRadius = SCALE.ringRadius.min + rng() * (SCALE.ringRadius.max - SCALE.ringRadius.min);
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
    const radius = entity.type === "object"
      ? SCALE.objectOrbit.min + rng() * (SCALE.objectOrbit.max - SCALE.objectOrbit.min)
      : SCALE.ringRadius.min * 0.5 + rng() * 10;
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
      const radius = SCALE.towerOrbit.min + rng() * (SCALE.towerOrbit.max - SCALE.towerOrbit.min);
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
      // Measure the bounding heights of both groups for a sensible gap
      const fromBox = new THREE.Box3().setFromObject(fromGroup);
      const toBox = new THREE.Box3().setFromObject(toGroup);
      const toH = toBox.max.y - toBox.min.y || 4;
      // Sink upper structure partially into lower (visual grounding)
      const sinkInto = toH * 0.15;
      const gap = Math.max(toH * 0.25, 3) - sinkInto;
      // Slight offset so upper structure reads as skyline, not ceiling
      const offsetAngle = rng() * Math.PI * 2;
      const offsetDist = 6 + rng() * 10;
      fromGroup.position.x = toGroup.position.x + Math.cos(offsetAngle) * offsetDist;
      fromGroup.position.z = toGroup.position.z + Math.sin(offsetAngle) * offsetDist;
      fromGroup.position.y = toGroup.position.y + toH + gap;
    }
  });

  // ── 14A: Dream distortions on placed entities ──────────────────────
  applyDreamDistortions(rng, groupById, world.semantics);

  // ── 14A: Populate density layers (ground / mid / upper / background)
  populateDensityLayers(rng, world.semantics, placedPositions, activeScaleMultiplier);

  setupFloatingGroups(groupById);

  const worldBounds = new THREE.Box3().setFromObject(worldGroup);
  if (worldBounds.isEmpty()) return;
  const center = worldBounds.getCenter(new THREE.Vector3());
  worldGroup.position.sub(center);

  // Tune fog to scene scale
  const size = new THREE.Box3().setFromObject(worldGroup).getSize(new THREE.Vector3());
  const sceneRadius = Math.max(size.x, size.z) * 0.5;
  if (scene && scene.fog instanceof THREE.Fog) {
    scene.fog.near = Math.max(sceneRadius * 0.4, 30);
    scene.fog.far = Math.min(Math.max(sceneRadius * 3.5, 200), 1000);
  }

  // ── Spawn composition: frame the main scene ───────────────────────
  const anchorGroup = groupById.get(anchor?.id ?? "");
  const spawnTarget = anchorGroup
    ? anchorGroup.getWorldPosition(new THREE.Vector3())
    : new THREE.Vector3(0, 1, 0);

  // Composition center from all visible groups
  const compositionCenter = new THREE.Vector3();
  let compositionCount = 0;
  groupById.forEach((g) => {
    const wp = g.getWorldPosition(new THREE.Vector3());
    compositionCenter.add(wp);
    compositionCount += 1;
  });
  if (compositionCount > 0) compositionCenter.divideScalar(compositionCount);

  // Choose spawn direction: away from floating structures when present
  let spawnAngle = rng() * Math.PI * 2;
  const floatingCenter = new THREE.Vector3();
  let floatingCount = 0;
  floatingGroups.forEach(({ group }) => {
    const wp = group.getWorldPosition(new THREE.Vector3());
    floatingCenter.add(wp);
    floatingCount += 1;
  });
  if (floatingCount > 0) {
    floatingCenter.divideScalar(floatingCount);
    const awayDir = new THREE.Vector2(
      spawnTarget.x - floatingCenter.x,
      spawnTarget.z - floatingCenter.z
    );
    if (awayDir.lengthSq() > 0.01) {
      spawnAngle = Math.atan2(awayDir.y, awayDir.x) + (rng() - 0.5) * 0.6;
    }
  }

  const spawnDist = 22 + rng() * 10;
  if (camera) {
    playerPos.set(
      spawnTarget.x + Math.cos(spawnAngle) * spawnDist,
      0,
      spawnTarget.z + Math.sin(spawnAngle) * spawnDist
    );
    camera.position.set(playerPos.x, PLAYER_EYE_HEIGHT, playerPos.z);
    // Frame reveal: look toward composition, slight upward tilt for floating elements
    const lookY = spawnTarget.y + Math.max(compositionCenter.y * 0.3, 1.5);
    camera.lookAt(compositionCenter.x, lookY, compositionCenter.z);
    syncAnglesToCamera();
  }

  // Build collision after all placement is final
  buildCollisionBoxes();
  discoveredLandmarks.clear();
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
  oceanWaveMeshes.length = 0;

  if (starfield) {
    starfield.geometry.dispose();
    if (starfield.material instanceof THREE.Material) {
      starfield.material.dispose();
    }
    scene.remove(starfield);
    starfield = null;
  }

  disposeObject3D(skyCloudGroup);
  skyCloudGroup = null;
  disposeObject3D(celestialGroup);
  celestialGroup = null;
  disposeObject3D(weatherRain);
  weatherRain = null;
  disposeObject3D(weatherSnow);
  weatherSnow = null;
  thunderActive = false;

  // Clean up streaming chunks
  loadedChunks.clear();
  streamingEnabled = false;
  activeSemantics = null;
  collisionBoxes.length = 0;
  discoveredLandmarks.clear();
  playerVelY = 0;
  isGrounded = true;
}

export function setControlsEnabled(enabled: boolean): void {
  controlsEnabled = enabled;
  if (!enabled) pressedKeys.clear();
}

function createGroupForEntity(entity: WorldEntity): THREE.Group {
  const name = entity.attributes.name;
  const rng = seededRandom(`${worldSeed}|${name}`);
  const generator = dictionaryGenerators[name];
  let group: THREE.Group;
  if (generator) {
    group = generator(rng);
  } else if (entity.type === "place") {
    group = createPlatformGroup();
  } else if (entity.type === "object") {
    group = createBoxGroup();
  } else {
    group = createUnknownGroup();
  }

  // Tag for interaction / collision / gameplay
  const tag = resolveInteractionTag(name, entity.type);
  group.userData.interactionTag = tag;
  group.traverse((child: THREE.Object3D) => { child.userData.interactionTag = tag; });
  return group;
}

function resolveInteractionTag(name: string, type: EntityType): string {
  const structures = ["city", "castle", "tower", "towers", "ruins", "ruin", "temple", "palace", "village", "bridge", "bridges", "gate", "gates"];
  const landmarks = ["statue", "statues", "pillar", "pillars", "crystal", "crystals", "dream zone"];
  const envClouds = ["cloud", "clouds"];
  const envBackground = ["ocean", "sea", "lake", "river", "beach", "forest", "mountain"];
  const interactive = ["tree", "trees", "stone", "stones", "rock", "rocks", "fragment", "fragments"];

  if (structures.includes(name)) return "structure";
  if (landmarks.includes(name)) return "landmark";
  if (envClouds.includes(name)) return "environment-cloud";
  if (envBackground.includes(name)) return "environment";
  if (interactive.includes(name)) return "interactive";
  if (type === "place") return "structure";
  if (type === "object") return "interactive";
  return "environment";
}

function baseYForEntity(entity: WorldEntity): number {
  const name = entity.attributes.name;
  if (entity.type === "place" && (name === "clouds" || name === "cloud")) return 30;
  if (entity.type === "place" && name === "beach") return 0.05;
  if (entity.type === "place") return 0.11;
  if (entity.type === "object") return 0;
  return 0;
}

function applyDescriptor(name: string, target: THREE.Group): void {
  if (name === "floating") {
    target.position.y += 15;
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

function updateMovement(delta: number): void {
  if (!camera || delta === 0) return;

  // Direction vectors based on yaw only (ground-projected)
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  const desired = new THREE.Vector3();
  if (pressedKeys.has("KeyW")) desired.add(forward);
  if (pressedKeys.has("KeyS")) desired.addScaledVector(forward, -1);
  if (pressedKeys.has("KeyA")) desired.addScaledVector(right, -1);
  if (pressedKeys.has("KeyD")) desired.add(right);

  if (desired.lengthSq() > 0) {
    const speed = pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight")
      ? MOVE_SPEED * SPRINT_MULTIPLIER
      : MOVE_SPEED;
    desired.normalize().multiplyScalar(speed);
  }

  movementVelocity.lerp(desired, MOVE_DAMPING);
  const moveDelta = movementVelocity.clone().multiplyScalar(delta);

  // Horizontal collision check
  const newX = playerPos.x + moveDelta.x;
  const newZ = playerPos.z + moveDelta.z;
  if (!collidesAt(newX, playerPos.y, playerPos.z)) {
    playerPos.x = newX;
  }
  if (!collidesAt(playerPos.x, playerPos.y, newZ)) {
    playerPos.z = newZ;
  }

  // Vertical physics: gravity + jump
  playerVelY -= GRAVITY * delta;
  playerPos.y += playerVelY * delta;

  // Ground detection: check cloud platforms and base ground
  const groundY = getGroundHeight(playerPos.x, playerPos.z);
  if (playerPos.y <= groundY) {
    playerPos.y = groundY;
    playerVelY = 0;
    isGrounded = true;
  } else {
    isGrounded = false;
  }

  // Walking detection and footstep accumulation
  const hSpeed = Math.sqrt(movementVelocity.x ** 2 + movementVelocity.z ** 2);
  const wasWalking = isWalking;
  isWalking = controlsEnabled && hSpeed > 0.5;

  let bobY = 0;
  let bobX = 0;
  if (isWalking) {
    const hDist = Math.sqrt(moveDelta.x ** 2 + moveDelta.z ** 2);
    accumulateFootstep(hDist);
    bobPhase += delta * hSpeed * 1.8;
    const bobAmt = currentSurfaceProfile.bobIntensity;
    bobY = Math.sin(bobPhase * 2) * 0.018 * bobAmt;
    bobX = Math.cos(bobPhase) * 0.008 * bobAmt;
  } else {
    if (wasWalking) resetFootstepAccumulator();
    bobPhase *= 0.9;
  }

  // Position avatar at player feet
  if (tpAvatar) {
    tpAvatar.position.set(playerPos.x, playerPos.y, playerPos.z);
    tpAvatar.rotation.y = yaw;
  }

  // Position camera
  if (cameraMode === "first") {
    camera.position.set(
      playerPos.x + bobX * Math.cos(yaw),
      playerPos.y + PLAYER_EYE_HEIGHT + bobY,
      playerPos.z + bobX * Math.sin(yaw)
    );
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    // Arm sway
    if (fpArms) {
      const sway = isWalking
        ? Math.sin(bobPhase * 2) * 0.02
        : Math.sin(performance.now() / 1000 * 0.8) * 0.006;
      fpArms.rotation.x = sway;
      fpArms.rotation.z = sway * 0.5;
    }
  } else {
    // Third person: camera behind and above player
    const camOffset = new THREE.Vector3(0, TP_OFFSET.y, TP_OFFSET.z);
    camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    camera.position.set(
      playerPos.x + camOffset.x,
      playerPos.y + PLAYER_EYE_HEIGHT + camOffset.y,
      playerPos.z + camOffset.z
    );
    camera.lookAt(playerPos.x, playerPos.y + PLAYER_HEIGHT * 0.8, playerPos.z);
  }
}

// ── Collision helpers ────────────────────────────────────────────────

function collidesAt(x: number, y: number, z: number): boolean {
  const px1 = x - 0.3;
  const px2 = x + 0.3;
  const py1 = y;
  const py2 = y + PLAYER_HEIGHT;
  const pz1 = z - 0.3;
  const pz2 = z + 0.3;
  for (const box of collisionBoxes) {
    if (box.isCloud) continue; // clouds are platforms, not walls
    if (px2 > box.min.x && px1 < box.max.x &&
        py2 > box.min.y && py1 < box.max.y &&
        pz2 > box.min.z && pz1 < box.max.z) {
      return true;
    }
  }
  return false;
}

function getGroundHeight(x: number, z: number): number {
  let best = 0; // base ground
  const margin = 0.4;
  for (const box of collisionBoxes) {
    if (!box.isCloud) continue;
    // Check if player is within horizontal bounds of this cloud platform
    if (x > box.min.x - margin && x < box.max.x + margin &&
        z > box.min.z - margin && z < box.max.z + margin) {
      // Above or near the top of the cloud: use as ground
      if (playerPos.y >= box.max.y - 0.5 && playerVelY <= 0) {
        best = Math.max(best, box.max.y);
      }
    }
  }
  return best;
}

function buildCollisionBoxes(): void {
  collisionBoxes.length = 0;
  if (!worldGroup) return;
  worldGroup.traverse((obj: THREE.Object3D) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const tag = obj.userData.interactionTag as string | undefined;
    if (!tag) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    collisionBoxes.push({
      min: box.min.clone(),
      max: box.max.clone(),
      isCloud: tag === "environment-cloud"
    });
  });
}

// ── Interaction system ───────────────────────────────────────────────

function updateInteraction(): void {
  if (!camera || !scene || !worldGroup) return;

  raycaster.setFromCamera(screenCenter, camera);
  const hits = raycaster.intersectObjects(worldGroup.children, true);

  // Restore previously highlighted object
  if (lookedAtObject) {
    const mat = (lookedAtObject as THREE.Mesh).material;
    if (mat instanceof THREE.MeshStandardMaterial && lookedAtOriginalEmissive) {
      mat.emissive.copy(lookedAtOriginalEmissive);
      mat.emissiveIntensity = lookedAtOriginalIntensity;
    }
    lookedAtObject = null;
  }

  let foundInteractable = false;
  for (const hit of hits) {
    const tag = getInteractionTag(hit.object);
    if (tag) {
      lookedAtObject = hit.object;
      // Highlight: brighten emissive
      const mat = (hit.object as THREE.Mesh).material;
      if (mat instanceof THREE.MeshStandardMaterial) {
        lookedAtOriginalEmissive = mat.emissive.clone();
        lookedAtOriginalIntensity = mat.emissiveIntensity;
        // Subtle highlight: tint toward cyan instead of white
        mat.emissive.setHex(0x88ccee);
        mat.emissiveIntensity = Math.min(lookedAtOriginalIntensity + 0.2, 0.8);
      }
      foundInteractable = true;
      break;
    }
  }

  // UI hint
  if (interactionHint) {
    interactionHint.style.display = foundInteractable ? "block" : "none";
  }

  // Clear feedback after timeout
  if (feedbackTimer > 0) {
    feedbackTimer -= 1;
    if (feedbackTimer <= 0 && feedbackText) {
      feedbackText.style.opacity = "0";
    }
  }
}

function getInteractionTag(obj: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (current.userData.interactionTag) return current.userData.interactionTag as string;
    current = current.parent;
  }
  return null;
}

function triggerInteraction(): void {
  if (!lookedAtObject) return;

  const tag = getInteractionTag(lookedAtObject) ?? "unknown";
  let message = "";

  playInteractionSound();

  if (tag.startsWith("structure")) {
    message = "You approach the structure...";
    // Pulse emissive + subtle nudge
    const mat = (lookedAtObject as THREE.Mesh).material;
    if (mat instanceof THREE.MeshStandardMaterial) {
      const origI = mat.emissiveIntensity;
      mat.emissiveIntensity = 1.2;
      setTimeout(() => { if (mat instanceof THREE.MeshStandardMaterial) mat.emissiveIntensity = origI; }, 400);
    }
    if (lookedAtObject.parent) {
      const p = lookedAtObject.parent;
      const origY = p.position.y;
      p.position.y += 0.2;
      setTimeout(() => { p.position.y = origY; }, 300);
    }
  } else if (tag === "environment-cloud") {
    message = "The cloud shifts beneath your gaze...";
    if (lookedAtObject.parent) {
      const target = lookedAtObject.parent;
      const origY = target.position.y;
      target.position.y += 0.6;
      setTimeout(() => { target.position.y = origY; }, 500);
    }
  } else if (tag === "interactive") {
    message = "It glows brighter for a moment...";
    const mat = (lookedAtObject as THREE.Mesh).material;
    if (mat instanceof THREE.MeshStandardMaterial) {
      const origI = mat.emissiveIntensity;
      const origC = mat.emissive.clone();
      mat.emissive.setHex(0xaaddff);
      mat.emissiveIntensity = 1.5;
      setTimeout(() => {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissiveIntensity = origI;
          mat.emissive.copy(origC);
        }
      }, 500);
    }
  } else if (tag === "landmark") {
    message = "You sense something important here...";
    checkLandmarkDiscovery(lookedAtObject);
  } else {
    message = "You examine the object closely...";
  }

  showFeedback(message);
}

function showFeedback(msg: string): void {
  if (feedbackText) {
    feedbackText.textContent = msg;
    feedbackText.style.opacity = "1";
    feedbackTimer = 120; // ~2 seconds at 60fps
  }
}

// ── Gameplay: discovery ──────────────────────────────────────────────

function checkLandmarkDiscovery(obj: THREE.Object3D): void {
  const id = String(obj.id);
  if (discoveredLandmarks.has(id)) return;
  discoveredLandmarks.add(id);

  if (discoveryText) {
    discoveryText.textContent = `You discovered something in your dream... (${discoveredLandmarks.size} found)`;
    discoveryText.style.opacity = "1";
    setTimeout(() => {
      if (discoveryText) discoveryText.style.opacity = "0";
    }, 3000);
  }

  // Visual reward pulse on the object
  const mat = (obj as THREE.Mesh).material;
  if (mat instanceof THREE.MeshStandardMaterial) {
    const orig = mat.emissiveIntensity;
    mat.emissiveIntensity = 2.5;
    setTimeout(() => { if (mat instanceof THREE.MeshStandardMaterial) mat.emissiveIntensity = orig; }, 800);
  }
}

function checkProximityDiscovery(): void {
  for (const box of collisionBoxes) {
    if (!box.isCloud) continue;
    // Skip — proximity discovery only for landmarks, handled via interaction
  }
  // Check if player is near any landmark group
  if (!worldGroup) return;
  worldGroup.children.forEach((child: THREE.Object3D) => {
    if (child.userData.interactionTag !== "landmark") return;
    const wp = child.getWorldPosition(new THREE.Vector3());
    const dist = wp.distanceTo(playerPos);
    if (dist < 8) {
      const id = String(child.id);
      if (!discoveredLandmarks.has(id)) {
        discoveredLandmarks.add(id);
        if (discoveryText) {
          discoveryText.textContent = `You discovered something in your dream... (${discoveredLandmarks.size} found)`;
          discoveryText.style.opacity = "1";
          setTimeout(() => { if (discoveryText) discoveryText.style.opacity = "0"; }, 3000);
        }
      }
    }
  });
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
    mesh.position.x = base.x + Math.sin(time * 0.08 + phase * 1.3) * 0.4;
    mesh.position.z = base.z + Math.cos(time * 0.06 + phase * 0.9) * 0.3;
  });

  cityEmissives.forEach(({ material, base, phase }) => {
    material.emissiveIntensity = base + Math.sin(time * 0.35 + phase) * 0.12;
  });

  oceanWaveMeshes.forEach((mesh, i) => {
    mesh.position.y = (mesh.userData.baseY as number) + Math.sin(time * 0.5 + i * 1.2) * 0.08;
  });
}

function positionCameraAtStart(anchor: THREE.Vector3, rng: () => number): void {
  if (!camera) return;

  const angle = rng() * Math.PI * 2;
  const radius = 16 + rng() * 6;
  const target = anchor.clone();

  playerPos.set(
    target.x + Math.cos(angle) * radius,
    0,
    target.z + Math.sin(angle) * radius
  );
  camera.position.set(playerPos.x, PLAYER_EYE_HEIGHT, playerPos.z);
  camera.lookAt(target.x, target.y + 1.3, target.z);
  syncAnglesToCamera();
}

// ── Scale intelligence ───────────────────────────────────────────────
function scaleMultiplierForSemantics(scale: ScaleType): number {
  switch (scale) {
    case "giant": return 2.5;
    case "tiny":  return 0.4;
    case "endless": return 1.2;
    default: return 1.0;
  }
}

// ── World streaming (chunk-based procedural expansion) ───────────────
function chunkKey(cx: number, cz: number): string { return `${cx},${cz}`; }

function playerChunkCoords(): [number, number] {
  return [
    Math.floor(playerPos.x / CHUNK_SIZE),
    Math.floor(playerPos.z / CHUNK_SIZE)
  ];
}

// Reusable geometries for chunk generation (performance)
const sharedGeo = {
  tree: null as THREE.CylinderGeometry | null,
  crown: null as THREE.SphereGeometry | null,
  stone: null as THREE.DodecahedronGeometry | null,
  patch: null as THREE.CircleGeometry | null,
};

function getSharedGeo(): typeof sharedGeo {
  if (!sharedGeo.tree) sharedGeo.tree = new THREE.CylinderGeometry(0.35, 0.4, 7, 6);
  if (!sharedGeo.crown) sharedGeo.crown = new THREE.SphereGeometry(3, 8, 8);
  if (!sharedGeo.stone) sharedGeo.stone = new THREE.DodecahedronGeometry(1, 0);
  if (!sharedGeo.patch) sharedGeo.patch = new THREE.CircleGeometry(1.5, 6);
  return sharedGeo;
}

const MAX_CHUNK_OBJECTS = 8;

function generateChunkContent(cx: number, cz: number): THREE.Group {
  const group = new THREE.Group();
  const chunkSeed = `${worldSeed}|chunk_${cx}_${cz}`;
  const rng = seededRandom(chunkSeed);

  if (!activeSemantics) return group;

  const centerX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
  const centerZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
  const sm = activeScaleMultiplier;

  const env = activeSemantics.environment;

  // Place 2-5 environment-themed props per chunk (capped)
  const propCount = Math.min(2 + Math.floor(rng() * 4), MAX_CHUNK_OBJECTS);
  const geo = getSharedGeo();
  for (let i = 0; i < propCount; i++) {
    const x = centerX + (rng() - 0.5) * CHUNK_SIZE * 0.8;
    const z = centerZ + (rng() - 0.5) * CHUNK_SIZE * 0.8;

    let mesh: THREE.Mesh;
    if (env === "forest" || env === "generic") {
      // Trees — use shared geometries with scale
      const trunkH = (SCALE.trunkH.min + rng() * (SCALE.trunkH.max - SCALE.trunkH.min)) * sm;
      const crownR = (SCALE.crownR.min + rng() * (SCALE.crownR.max - SCALE.crownR.min)) * sm;
      const trunk = new THREE.Mesh(
        geo.tree!,
        new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
      );
      trunk.scale.set(sm, trunkH / 7, sm);
      trunk.position.set(x, trunkH / 2, z);
      trunk.castShadow = true;
      group.add(trunk);
      const crown = new THREE.Mesh(
        geo.crown!,
        new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 })
      );
      crown.scale.setScalar(crownR / 3);
      crown.position.set(x, trunkH + crownR * 0.5, z);
      crown.castShadow = true;
      group.add(crown);
      continue;
    } else if (env === "city") {
      const w = (SCALE.buildingW.min + rng() * (SCALE.buildingW.max - SCALE.buildingW.min)) * sm;
      const h = (SCALE.buildingH.min + rng() * (SCALE.buildingH.max - SCALE.buildingH.min)) * sm * 0.6;
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, w),
        new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5, metalness: 0.2 })
      );
      mesh.position.set(x, h / 2, z);
    } else if (env === "ocean" || env === "sky") {
      // Rocks / small islands — shared geometry
      const r = (0.8 + rng() * 2.0) * sm;
      mesh = new THREE.Mesh(
        geo.stone!,
        new THREE.MeshStandardMaterial({ color: 0x5a6b70, roughness: 0.85 })
      );
      mesh.scale.setScalar(r);
      mesh.position.set(x, r * 0.3, z);
    } else if (env === "desert") {
      const r = (1 + rng() * 3) * sm;
      mesh = new THREE.Mesh(
        new THREE.ConeGeometry(r, r * 2, 6),
        new THREE.MeshStandardMaterial({ color: 0xc2a66b, roughness: 0.9 })
      );
      mesh.position.set(x, r, z);
    } else if (env === "mountain") {
      const r = (SCALE.mountainR.min * 0.3 + rng() * SCALE.mountainR.min * 0.4) * sm;
      const h = (SCALE.mountainH.min * 0.3 + rng() * SCALE.mountainH.min * 0.4) * sm;
      mesh = new THREE.Mesh(
        new THREE.ConeGeometry(r, h, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b7b80, roughness: 0.85 })
      );
      mesh.position.set(x, h / 2, z);
    } else {
      // Stones (generic)
      const r = (SCALE.stoneR.min + rng() * (SCALE.stoneR.max - SCALE.stoneR.min)) * sm;
      mesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(r, 0),
        new THREE.MeshStandardMaterial({ color: 0x6b6b6e, roughness: 0.85 })
      );
      mesh.position.set(x, r * 0.5, z);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Sparse ground cover patches
  if (env !== "ocean" && env !== "sky") {
    const patchCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < patchCount; i++) {
      const px = centerX + (rng() - 0.5) * CHUNK_SIZE * 0.9;
      const pz = centerZ + (rng() - 0.5) * CHUNK_SIZE * 0.9;
      const pr = (1 + rng() * 2) * sm;
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(pr, 8),
        new THREE.MeshStandardMaterial({
          color: env === "desert" ? 0xb89d6a : 0x1e2e1a,
          roughness: 0.95,
          side: THREE.DoubleSide
        })
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(px, 0.02, pz);
      group.add(patch);
    }
  }

  return group;
}

function updateStreaming(): void {
  if (!streamingEnabled || !worldGroup) return;

  const [pcx, pcz] = playerChunkCoords();
  if (pcx === lastPlayerChunkX && pcz === lastPlayerChunkZ) return;
  lastPlayerChunkX = pcx;
  lastPlayerChunkZ = pcz;

  // Load nearby chunks
  for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
      const cx = pcx + dx;
      const cz = pcz + dz;
      // Skip origin chunks (covered by initial scene)
      if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) continue;
      const key = chunkKey(cx, cz);
      if (loadedChunks.has(key)) continue;

      const chunkGroup = generateChunkContent(cx, cz);
      worldGroup.add(chunkGroup);
      loadedChunks.set(key, { key, cx, cz, group: chunkGroup });
    }
  }

  // Unload far chunks
  const toRemove: string[] = [];
  loadedChunks.forEach((chunk) => {
    const dist = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
    if (dist > UNLOAD_RADIUS) {
      chunk.group.traverse((obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            (obj.material as THREE.Material[]).forEach((m: THREE.Material) => m.dispose());
          } else {
            (obj.material as THREE.Material).dispose();
          }
        }
      });
      chunk.group.removeFromParent();
      toRemove.push(chunk.key);
    }
  });
  toRemove.forEach((k) => loadedChunks.delete(k));
}

function toggleCameraMode(): void {
  cameraMode = cameraMode === "first" ? "third" : "first";
  if (fpArms) fpArms.visible = cameraMode === "first";
  if (tpAvatar) tpAvatar.visible = cameraMode === "third";
  // Update UI hint
  const hint = document.getElementById("camera-mode-hint");
  if (hint) hint.textContent = cameraMode === "first" ? "1st Person" : "3rd Person";
}

export { toggleCameraMode };
export function getCameraMode(): CameraMode { return cameraMode; }

// ── Player embodiment builders ───────────────────────────────────────

function buildFPArms(): THREE.Group {
  const arms = new THREE.Group();
  arms.renderOrder = 999;
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.24), mat);
    arm.position.set(side * 0.18, -0.22, -0.34);
    arm.rotation.x = 0.25;
    arm.castShadow = false;
    arms.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mat);
    hand.position.set(side * 0.18, -0.25, -0.50);
    arms.add(hand);
  }
  return arms;
}

function buildTPAvatar(): THREE.Group {
  const avatar = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.7 });
  const bodyH = PLAYER_HEIGHT * 0.65;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, bodyH, 6, 12), bodyMat);
  body.position.y = bodyH / 2 + 0.25;
  body.castShadow = true;
  avatar.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), bodyMat);
  head.position.y = PLAYER_HEIGHT - 0.2;
  head.castShadow = true;
  avatar.add(head);
  avatar.visible = false; // hidden in first person
  return avatar;
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

// ── Density & Layer System (14A) ─────────────────────────────────────

type DensityLevel = "low" | "medium" | "high";

function inferDensityLevel(semantics: SemanticTags): DensityLevel {
  if (semantics.scale === "giant" || semantics.scale === "endless") return "high";
  if (semantics.scale === "tiny") return "low";
  if (semantics.mood === "chaotic" || semantics.mood === "mystical") return "high";
  return "medium";
}

function densityCounts(level: DensityLevel): { ground: number; mid: number; upper: number; background: number } {
  switch (level) {
    case "high": return { ground: 45, mid: 20, upper: 10, background: 18 };
    case "medium": return { ground: 28, mid: 12, upper: 6, background: 14 };
    case "low": return { ground: 15, mid: 6, upper: 3, background: 10 };
  }
}

function populateDensityLayers(
  rng: () => number,
  semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup) return;
  const density = inferDensityLevel(semantics);
  const counts = densityCounts(density);
  const env = semantics.environment;

  // --- Ground layer: small terrain detail ---
  for (let i = 0; i < counts.ground; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 15 + rng() * 120;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (placedPositions.some((p) => p.distanceTo(pos) < 6)) continue;
    const detail = createGroundDetail(rng, env, sm);
    detail.position.copy(pos);
    worldGroup.add(detail);
  }

  // --- Mid layer: filler structures ---
  for (let i = 0; i < counts.mid; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 20 + rng() * 80;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (placedPositions.some((p) => p.distanceTo(pos) < SCALE.minSpacing)) continue;
    const filler = createMidLayerFiller(rng, env, sm);
    filler.position.copy(pos);
    worldGroup.add(filler);
  }

  // --- Upper layer: floating elements ---
  for (let i = 0; i < counts.upper; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 10 + rng() * 100;
    const y = 20 + rng() * 40;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
    const floating = createUpperLayerElement(rng, env, sm);
    floating.position.copy(pos);
    floating.userData.floating = true;
    floatingGroups.push({ group: floating, baseY: y, phase: rng() * Math.PI * 2 });
    worldGroup.add(floating);
  }

  // --- Background layer: distant silhouettes ---
  for (let i = 0; i < counts.background; i++) {
    const angle = (i / counts.background) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const dist = 200 + rng() * 200;
    const silhouette = createBackgroundSilhouette(rng, env, sm);
    silhouette.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    worldGroup.add(silhouette);
  }
}

function createGroundDetail(rng: () => number, env: EnvironmentType, sm: number): THREE.Group {
  const group = new THREE.Group();

  if (env === "forest" || env === "generic") {
    const count = 2 + Math.floor(rng() * 4);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e3a1a, roughness: 0.85 });
    for (let i = 0; i < count; i++) {
      const r = (0.3 + rng() * 0.6) * sm;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), leafMat);
      bush.position.set((rng() - 0.5) * 3, r * 0.5, (rng() - 0.5) * 3);
      bush.castShadow = true;
      group.add(bush);
    }
  } else if (env === "city") {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4a50, roughness: 0.8 });
    const count = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const w = (0.3 + rng() * 0.8) * sm;
      const h = (0.2 + rng() * 0.5) * sm;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      box.position.set((rng() - 0.5) * 4, h / 2, (rng() - 0.5) * 4);
      box.rotation.y = rng() * Math.PI;
      group.add(box);
    }
  } else if (env === "ocean") {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a6570, roughness: 0.85 });
    const r = (0.4 + rng() * 1.0) * sm;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    rock.position.y = r * 0.2;
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    rock.castShadow = true;
    group.add(rock);
  } else if (env === "desert") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb89d6a, roughness: 0.95 });
    const r = (0.5 + rng() * 1.5) * sm;
    const dune = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 4), mat);
    dune.scale.y = 0.3;
    dune.position.y = r * 0.1;
    group.add(dune);
  } else if (env === "mountain") {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b7b80, roughness: 0.9 });
    const count = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const r = (0.5 + rng() * 1.2) * sm;
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
      boulder.position.set((rng() - 0.5) * 4, r * 0.4, (rng() - 0.5) * 4);
      boulder.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
      boulder.castShadow = true;
      group.add(boulder);
    }
  } else if (env === "sky") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.9, transparent: true, opacity: 0.5 });
    const r = (0.5 + rng() * 1.5) * sm;
    const wisp = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), mat);
    wisp.scale.y = 0.3;
    wisp.position.y = 0.5 + rng() * 3;
    group.add(wisp);
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b6b6e, roughness: 0.85 });
    const r = (0.3 + rng() * 0.8) * sm;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    stone.position.y = r * 0.4;
    stone.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    group.add(stone);
  }

  return group;
}

function createMidLayerFiller(rng: () => number, env: EnvironmentType, sm: number): THREE.Group {
  const group = new THREE.Group();

  if (env === "city") {
    const count = 2 + Math.floor(rng() * 3);
    const mat = new THREE.MeshStandardMaterial({
      color: [0x3a3f48, 0x2e3540, 0x454d5a][Math.floor(rng() * 3)],
      roughness: 0.5 + rng() * 0.3,
      metalness: 0.1 + rng() * 0.2
    });
    for (let i = 0; i < count; i++) {
      const w = (2 + rng() * 4) * sm;
      const h = (3 + rng() * 12) * sm;
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      building.position.set((rng() - 0.5) * 15, h / 2, (rng() - 0.5) * 15);
      building.castShadow = true;
      building.receiveShadow = true;
      group.add(building);
    }
  } else if (env === "forest") {
    const count = 3 + Math.floor(rng() * 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1a4a2a, roughness: 0.7 });
    for (let i = 0; i < count; i++) {
      const trunkH = (SCALE.trunkH.min + rng() * (SCALE.trunkH.max - SCALE.trunkH.min)) * sm;
      const trunkR = (0.2 + rng() * 0.15) * sm;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.65, trunkR, trunkH, 8), trunkMat);
      trunk.position.set((rng() - 0.5) * 20, trunkH / 2, (rng() - 0.5) * 20);
      trunk.castShadow = true;
      group.add(trunk);
      const crownR = (SCALE.crownR.min + rng() * (SCALE.crownR.max - SCALE.crownR.min)) * sm;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(crownR, 10, 10), leafMat);
      crown.position.set(trunk.position.x, trunkH + crownR * 0.6, trunk.position.z);
      crown.castShadow = true;
      group.add(crown);
    }
  } else if (env === "ocean") {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a6570, roughness: 0.85 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const r = (1.5 + rng() * 3) * sm;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), mat);
      rock.position.set((rng() - 0.5) * 20, r * 0.3, (rng() - 0.5) * 20);
      rock.rotation.set(rng() * 0.3, rng() * Math.PI, 0);
      rock.castShadow = true;
      group.add(rock);
    }
  } else if (env === "mountain") {
    const count = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      const h = (8 + rng() * 15) * sm;
      const r = (5 + rng() * 8) * sm;
      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(r, h, 8),
        new THREE.MeshStandardMaterial({ color: 0x5a5a5e, roughness: 0.9 })
      );
      peak.position.set((rng() - 0.5) * 30, h / 2, (rng() - 0.5) * 30);
      peak.castShadow = true;
      group.add(peak);
    }
  } else if (env === "desert") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc2a66b, roughness: 0.85 });
    const count = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const h = (3 + rng() * 8) * sm;
      const r = (1 + rng() * 2) * sm;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, h, 8), mat);
      pillar.position.set((rng() - 0.5) * 20, h / 2, (rng() - 0.5) * 20);
      pillar.castShadow = true;
      group.add(pillar);
    }
  } else if (env === "sky") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe0e4ea, roughness: 0.9, transparent: true, opacity: 0.7 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const r = (3 + rng() * 6) * sm;
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat);
      cloud.scale.y = 0.2 + rng() * 0.15;
      cloud.position.set((rng() - 0.5) * 40, rng() * 15, (rng() - 0.5) * 40);
      group.add(cloud);
    }
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.85 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const h = (2 + rng() * 5) * sm;
      const w = (0.8 + rng() * 1.5) * sm;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.3), mat);
      wall.position.set((rng() - 0.5) * 15, h / 2, (rng() - 0.5) * 15);
      wall.rotation.y = rng() * Math.PI;
      wall.rotation.z = (rng() - 0.5) * 0.15;
      wall.castShadow = true;
      group.add(wall);
    }
  }

  // Environmental storytelling: slight tilt on some filler structures
  if (rng() < 0.25) {
    group.rotation.z = (rng() - 0.5) * 0.08;
    group.rotation.x = (rng() - 0.5) * 0.05;
  }

  return group;
}

function createUpperLayerElement(rng: () => number, env: EnvironmentType, sm: number): THREE.Group {
  const group = new THREE.Group();
  const roll = rng();

  if (roll < 0.3) {
    // Floating rock/fragment cluster
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a8580, roughness: 0.7,
      emissive: new THREE.Color(0x2a2520), emissiveIntensity: 0.15
    });
    const count = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const s = (0.5 + rng() * 1.5) * sm;
      const frag = new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), mat);
      frag.position.set((rng() - 0.5) * 6, rng() * 3, (rng() - 0.5) * 6);
      frag.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      frag.castShadow = true;
      group.add(frag);
    }
  } else if (roll < 0.6) {
    // Floating cloud platform
    const mat = new THREE.MeshStandardMaterial({ color: 0xe0e4ea, roughness: 0.85, transparent: true, opacity: 0.6 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const r = (2 + rng() * 5) * sm;
      const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat);
      blob.scale.y = 0.2 + rng() * 0.15;
      blob.position.set((rng() - 0.5) * 8, (rng() - 0.5) * 2, (rng() - 0.5) * 8);
      group.add(blob);
    }
  } else if (roll < 0.8 && (env === "city" || env === "generic")) {
    // Floating building fragment (dream logic: inverted or tilted)
    const h = (3 + rng() * 8) * sm;
    const w = (2 + rng() * 3) * sm;
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5 + rng() * 0.3, metalness: 0.15 });
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    building.castShadow = true;
    group.add(building);
    if (rng() < 0.4) {
      group.rotation.x = Math.PI; // inverted building
    } else {
      group.rotation.z = (rng() - 0.5) * 0.5;
    }
  } else {
    // Glowing crystal cluster
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7bb8d4, roughness: 0.1, metalness: 0.3,
      transparent: true, opacity: 0.6,
      emissive: new THREE.Color(0x4488aa), emissiveIntensity: 0.3
    });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const h = (1 + rng() * 3) * sm;
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.4 + rng() * 0.4, h, 6), mat);
      crystal.position.set((rng() - 0.5) * 4, (rng() - 0.5) * 2, (rng() - 0.5) * 4);
      crystal.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.5);
      crystal.castShadow = true;
      group.add(crystal);
    }
  }

  return group;
}

function createBackgroundSilhouette(rng: () => number, env: EnvironmentType, sm: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1e28, fog: true });

  const roll = rng();
  if (roll < 0.3 || env === "mountain") {
    // Distant mountain range
    const count = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const h = (30 + rng() * 60) * sm;
      const r = (15 + rng() * 25) * sm;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat);
      peak.position.set((rng() - 0.5) * 60, h / 2, (rng() - 0.5) * 40);
      group.add(peak);
    }
  } else if (roll < 0.6 || env === "city") {
    // Distant city skyline
    const count = 6 + Math.floor(rng() * 8);
    for (let i = 0; i < count; i++) {
      const w = (3 + rng() * 6) * sm;
      const h = (10 + rng() * 40) * sm;
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      building.position.set((rng() - 0.5) * 80, h / 2, (rng() - 0.5) * 20);
      group.add(building);
    }
  } else if (roll < 0.8) {
    // Distant towers/spires
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const h = (20 + rng() * 50) * sm;
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * sm, 3 * sm, h, 8), mat);
      spire.position.set((rng() - 0.5) * 50, h / 2, (rng() - 0.5) * 30);
      group.add(spire);
    }
  } else {
    // Distant cloud masses / floating islands
    const count = 2 + Math.floor(rng() * 4);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0x3a3e4a, fog: true, transparent: true, opacity: 0.5 });
    for (let i = 0; i < count; i++) {
      const r = (8 + rng() * 20) * sm;
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), cloudMat);
      cloud.scale.y = 0.25;
      cloud.position.set((rng() - 0.5) * 60, 20 + rng() * 40, (rng() - 0.5) * 40);
      group.add(cloud);
    }
  }

  return group;
}

// ── Dream Distortions (14A-D) ────────────────────────────────────────

function applyDreamDistortions(rng: () => number, groupById: GroupMap, semantics: SemanticTags): void {
  // Only apply in dreamlike/mystical/chaotic moods
  if (semantics.mood !== "dreamlike" && semantics.mood !== "mystical" && semantics.mood !== "chaotic") return;

  const distortionChance = semantics.mood === "chaotic" ? 0.35 : 0.2;

  groupById.forEach((group) => {
    if (rng() > distortionChance) return;
    const tag = group.userData.interactionTag || "";

    // Slight tilt on structures (environmental storytelling)
    if (tag === "structure" && rng() < 0.4) {
      group.rotation.z += (rng() - 0.5) * 0.12;
      group.rotation.x += (rng() - 0.5) * 0.08;
    }

    // Scale variation (dream logic: oversized/undersized objects)
    if (rng() < 0.3) {
      const scaleFactor = 0.6 + rng() * 1.2;
      group.scale.multiplyScalar(scaleFactor);
    }
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
  const material = new THREE.MeshBasicMaterial({
    map: createSkyGradient(topColor, bottomColor),
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -1;
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

// --------------- Sky & Weather System ---------------

const SKY_COLORS: Record<SkyMode, [number, number]> = {
  day: [0x3a7ae8, 0xb0d4ff],
  sunset: [0x2a1040, 0xb86a40],
  night: [0x05070e, 0x1b2634],
  storm: [0x12121a, 0x282830],
  surreal: [0x080215, 0x1c1228]
};

const FOG_COLORS: Record<SkyMode, number> = {
  day: 0xb0d4ff,
  sunset: 0xb86a40,
  night: 0x1b2634,
  storm: 0x282830,
  surreal: 0x1c1228
};

const AMBIENT_INT: Record<SkyMode, number> = {
  day: 0.55, sunset: 0.4, night: 0.25, storm: 0.3, surreal: 0.35
};
const DIR_INT: Record<SkyMode, number> = {
  day: 1.8, sunset: 1.3, night: 0.8, storm: 0.5, surreal: 1.0
};
const DIR_COL: Record<SkyMode, number> = {
  day: 0xfff5e0, sunset: 0xffa050, night: 0xb0c0e0, storm: 0x9090a0, surreal: 0xc0a0ff
};

interface SkyProfile {
  mode: SkyMode;
  weather: string[];
  celestial: string[];
}

function resolveSkyProfile(world: WorldModel): SkyProfile {
  const names = new Set(world.entities.map((e) => e.attributes.name));
  const sem = world.semantics;

  const stormCues = ["storm", "stormy", "thunder"];
  const surrealCues = [
    "glowing", "mystical", "surreal", "dreamlike", "ethereal",
    "magical", "enchanted", "spectral", "luminous", "cosmic"
  ];
  const nightCues = ["moon", "stars", "night", "space", "dark", "starry"];
  const sunsetCues = ["sunset", "dusk", "purple", "golden"];
  const rainCues = ["rain", "rainy"];
  const snowCues = ["snow", "snowy", "frozen"];

  let mode: SkyMode = "day";
  const weather: string[] = [];
  const celestial: string[] = [];

  if (stormCues.some((c) => names.has(c)) || sem.weather === "storm") {
    mode = "storm";
    weather.push("rain", "thunder");
  } else if (surrealCues.some((c) => names.has(c)) || sem.mood === "mystical" || sem.mood === "dreamlike") {
    mode = "surreal";
    celestial.push("stars");
  } else if (nightCues.some((c) => names.has(c)) || sem.time === "night") {
    mode = "night";
    celestial.push("stars", "moon");
  } else if (sunsetCues.some((c) => names.has(c)) || sem.time === "sunset") {
    mode = "sunset";
    celestial.push("sun");
  } else {
    celestial.push("sun");
  }

  if ((rainCues.some((c) => names.has(c)) || sem.weather === "rain") && !weather.includes("rain")) {
    weather.push("rain");
  }
  if (snowCues.some((c) => names.has(c)) || sem.weather === "snow") {
    weather.push("snow");
  }
  if ((mode === "day" || mode === "sunset") && !weather.includes("rain") && !weather.includes("snow")) {
    weather.push("clouds");
  }

  return { mode, weather, celestial };
}

function applySkyProfile(
  profile: SkyProfile,
  signature: string,
  rng: () => number
): void {
  if (!scene) return;

  // Replace sky dome
  if (skyDome) {
    scene.remove(skyDome);
    skyDome.geometry.dispose();
    (skyDome.material as THREE.Material).dispose();
  }
  const [skyTop, skyBottom] = SKY_COLORS[profile.mode];
  skyDome = createSkyDome(500, skyTop, skyBottom);
  scene.add(skyDome);

  // Fog color
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(FOG_COLORS[profile.mode]);
  }

  // Mood coherence tints
  if (activeSemantics) {
    const mood = activeSemantics.mood;
    if (mood === "mystical" || mood === "dreamlike") {
      if (rimLight) { rimLight.color.setHex(0xb060ff); rimLight.intensity = 0.5; }
    } else if (mood === "dark") {
      if (ambientLight) ambientLight.intensity *= 0.75;
      if (scene.fog instanceof THREE.Fog) scene.fog.far *= 0.6;
    } else if (mood === "calm") {
      if (fillLight) fillLight.intensity += 0.15;
    }
  }

  // Lighting
  if (ambientLight) ambientLight.intensity = AMBIENT_INT[profile.mode];
  if (directionalLight) {
    directionalLight.intensity = DIR_INT[profile.mode];
    directionalLight.color.setHex(DIR_COL[profile.mode]);
    directionalLight.userData.baseIntensity = DIR_INT[profile.mode];
    // Adjust sun angle per mode
    if (profile.mode === "sunset") {
      directionalLight.position.set(25, 8, -15);
    } else if (profile.mode === "night") {
      directionalLight.position.set(-10, 20, 8);
    } else {
      directionalLight.position.set(15, 25, 10);
    }
  }
  if (fillLight) fillLight.intensity = profile.mode === "day" ? 0.4 : 0.2;
  if (rimLight) rimLight.intensity = profile.mode === "surreal" ? 0.5 : 0.3;
  if (hemiLight) {
    const HEMI: Record<SkyMode, [number, number, number]> = {
      day: [0x87ceeb, 0x362a1a, 0.45],
      sunset: [0xff8844, 0x2a1508, 0.5],
      night: [0x1a2a4a, 0x080808, 0.25],
      storm: [0x4a4a5a, 0x1a1a1a, 0.3],
      surreal: [0x8040c0, 0x0a0618, 0.4]
    };
    const [sky, gnd, hi] = HEMI[profile.mode];
    hemiLight.color.setHex(sky);
    hemiLight.groundColor.setHex(gnd);
    hemiLight.intensity = hi;
  }

  // Starfield (night / surreal only)
  if (profile.mode === "night" || profile.mode === "surreal") {
    starfield = createStarfield(signature, 1200, 400);
    scene.add(starfield);
  }

  // Celestial bodies
  celestialGroup = new THREE.Group();
  if (profile.celestial.includes("sun")) {
    const sunR = profile.mode === "sunset" ? 5 : 3;
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(sunR, 16, 16),
      new THREE.MeshBasicMaterial({ color: profile.mode === "sunset" ? 0xff9944 : 0xffee88 })
    );
    sun.position.set(
      profile.mode === "sunset" ? 60 : 40,
      profile.mode === "sunset" ? 18 : 50,
      profile.mode === "sunset" ? -40 : -30
    );
    const sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(sunR * 2.2, 16, 16),
      new THREE.MeshBasicMaterial({
        color: profile.mode === "sunset" ? 0xff7722 : 0xffee88,
        transparent: true,
        opacity: 0.15,
        depthWrite: false
      })
    );
    sunGlow.position.copy(sun.position);
    celestialGroup.add(sun, sunGlow);
  }
  if (profile.celestial.includes("moon")) {
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xd8dce8 })
    );
    moon.position.set(-30, 45, 20);
    const moonGlow = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xc0c8e0,
        transparent: true,
        opacity: 0.1,
        depthWrite: false
      })
    );
    moonGlow.position.copy(moon.position);
    celestialGroup.add(moon, moonGlow);
  }
  scene.add(celestialGroup);

  // Sky clouds
  if (profile.weather.includes("clouds") || profile.mode === "storm") {
    skyCloudGroup = createSkyClouds(rng, profile.mode === "storm" || profile.mode === "night");
    scene.add(skyCloudGroup);
  }

  // Weather particles
  if (profile.weather.includes("rain") || profile.weather.includes("thunder")) {
    weatherRain = createRainSystem(rng);
    scene.add(weatherRain);
  }
  if (profile.weather.includes("snow")) {
    weatherSnow = createSnowSystem(rng);
    scene.add(weatherSnow);
  }

  thunderActive = profile.weather.includes("thunder");
  thunderTimer = thunderActive ? 3 + rng() * 5 : 0;
}

function createSkyClouds(rng: () => number, dark: boolean): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: dark ? 0x3a3a4a : 0xe8e8f0,
    transparent: true,
    opacity: dark ? 0.3 : 0.4,
    depthWrite: false
  });
  const count = 6 + Math.floor(rng() * 6);
  for (let i = 0; i < count; i += 1) {
    const puffs = 3 + Math.floor(rng() * 4);
    const cx = (rng() - 0.5) * 60;
    const cy = 20 + rng() * 10;
    const cz = (rng() - 0.5) * 60;
    for (let j = 0; j < puffs; j += 1) {
      const r = 2 + rng() * 3;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat);
      mesh.position.set(cx + (rng() - 0.5) * 6, cy + (rng() - 0.5) * 1.5, cz + (rng() - 0.5) * 6);
      group.add(mesh);
    }
  }
  return group;
}

function createRainSystem(rng: () => number): THREE.Points {
  const count = 400;
  const positions = new Float32Array(count * 3);
  const spread = 30;
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rng() - 0.5) * spread;
    positions[i * 3 + 1] = rng() * 20;
    positions[i * 3 + 2] = (rng() - 0.5) * spread;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xaabbdd,
    size: 0.15,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  });
  return new THREE.Points(geo, mat);
}

function createSnowSystem(rng: () => number): THREE.Points {
  const count = 200;
  const positions = new Float32Array(count * 3);
  const spread = 25;
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rng() - 0.5) * spread;
    positions[i * 3 + 1] = rng() * 15;
    positions[i * 3 + 2] = (rng() - 0.5) * spread;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.2,
    transparent: true,
    opacity: 0.7,
    depthWrite: false
  });
  return new THREE.Points(geo, mat);
}

function updateWeather(dt: number): void {
  if (weatherRain) {
    const pos = weatherRain.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i += 1) {
      arr[i * 3 + 1] -= dt * 12;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 18 + Math.random() * 4;
    }
    pos.needsUpdate = true;
  }

  if (weatherSnow) {
    const pos = weatherSnow.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const time = performance.now() / 1000;
    for (let i = 0; i < pos.count; i += 1) {
      arr[i * 3 + 1] -= dt * 1.5;
      arr[i * 3] += Math.sin(time + i * 0.5) * dt * 0.3;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 12 + Math.random() * 3;
    }
    pos.needsUpdate = true;
  }

  if (thunderActive && directionalLight) {
    thunderTimer -= dt;
    if (thunderTimer <= 0) {
      const base = (directionalLight.userData.baseIntensity as number) ?? 0.5;
      directionalLight.intensity = base * 6;
      setTimeout(() => {
        if (directionalLight) directionalLight.intensity = base;
      }, 100);
      thunderTimer = 5 + Math.random() * 10;
    }
  }
}

function disposeObject3D(obj: THREE.Object3D | null): void {
  if (!obj || !scene) return;
  obj.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        (child.material as THREE.Material[]).forEach((m: THREE.Material) => m.dispose());
      } else if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
  });
  scene.remove(obj);
}

// --------------- Dictionary Generators ---------------

const dictionaryGenerators: Record<string, (rng: () => number) => THREE.Group> = {
  city: createCityGroup,
  clouds: createCloudGroup,
  cloud: createCloudGroup,
  towers: createTowerGroup,
  tower: createTowerGroup,
  beach: createBeachGroup,
  forest: createForestGroup,
  castle: createCastleGroup,
  ruins: createRuinsGroup,
  ruin: createRuinsGroup,
  ocean: createOceanGroup,
  sea: createOceanGroup,
  lake: createOceanGroup,
  river: createOceanGroup,
  stone: createStoneGroup,
  stones: createStoneGroup,
  rock: createStoneGroup,
  rocks: createStoneGroup,
  fragment: createFragmentGroup,
  fragments: createFragmentGroup,
  crystal: createCrystalGroup,
  crystals: createCrystalGroup,
  bridge: createBridgeGroup,
  bridges: createBridgeGroup,
  tree: createTreeGroup,
  trees: createForestGroup,
  mountain: createMountainGroup,
  pillar: createPillarGroup,
  pillars: createPillarGroup,
  statue: createStatueGroup,
  statues: createStatueGroup,
  gate: createGateGroup,
  gates: createGateGroup,
  "dream zone": createDreamZoneGroup
};

function createCityGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const baseColors = [0x3a3f48, 0x2e3540, 0x454d5a, 0x36404c, 0x424956];
  const emissiveColors = [0x3b4a63, 0x5a4030, 0x2a3a5a, 0x4a3a28, 0x3a5a4a];

  const gridSize = SCALE.cityGrid;
  const spacing = SCALE.citySpacing;
  const targetBuildings = 24 + Math.floor(rng() * 18);
  let count = 0;

  for (let x = 0; x < gridSize; x += 1) {
    for (let z = 0; z < gridSize; z += 1) {
      if (count >= targetBuildings) break;
      if (rng() < 0.15) continue;
      if (x === Math.floor(gridSize / 2) && z === Math.floor(gridSize / 2)) continue;

      const width = SCALE.buildingW.min + rng() * (SCALE.buildingW.max - SCALE.buildingW.min);
      const depth = SCALE.buildingW.min + rng() * (SCALE.buildingW.max - SCALE.buildingW.min);
      const height = SCALE.buildingH.min + rng() * (SCALE.buildingH.max - SCALE.buildingH.min);
      const eIntensity = 0.4 + rng() * 0.35;
      const mat = new THREE.MeshStandardMaterial({
        color: baseColors[Math.floor(rng() * baseColors.length)],
        emissive: new THREE.Color(emissiveColors[Math.floor(rng() * emissiveColors.length)]),
        emissiveIntensity: eIntensity,
        roughness: 0.35 + rng() * 0.4,
        metalness: 0.1 + rng() * 0.3
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        mat
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
        material: mat,
        base: eIntensity,
        phase: (x + z) * 0.6
      });
      cityMaxHeight = Math.max(cityMaxHeight, height);
      count += 1;
    }
  }

  // Landmark towers within city
  for (let i = 0; i < 3; i += 1) {
    const height = SCALE.towerH.min + rng() * (SCALE.towerH.max - SCALE.towerH.min) * 0.7;
    const w = 3 + rng() * 2;
    const eIntensity = 0.45 + rng() * 0.3;
    const tMat = new THREE.MeshStandardMaterial({
      color: baseColors[Math.floor(rng() * baseColors.length)],
      emissive: new THREE.Color(emissiveColors[Math.floor(rng() * emissiveColors.length)]),
      emissiveIntensity: eIntensity,
      roughness: 0.3 + rng() * 0.3,
      metalness: 0.15 + rng() * 0.35
    });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, height, w),
      tMat
    );
    mesh.position.set(
      (rng() - 0.5) * SCALE.citySpread * 0.6,
      height / 2,
      (rng() - 0.5) * SCALE.citySpread * 0.6
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    cityEmissives.push({
      material: tMat,
      base: eIntensity,
      phase: i * 0.8
    });
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

  // If clouds support a city above them, use large flat platform blobs
  const rScale = cloudSupportsCity ? SCALE.cloudPlatR : SCALE.cloudR;
  const spread = cloudSupportsCity ? SCALE.cloudPlatSpread : SCALE.cloudSpread;
  const count = cloudSupportsCity ? 10 + Math.floor(rng() * 6) : 8 + Math.floor(rng() * 6);

  for (let i = 0; i < count; i += 1) {
    const radius = rScale.min + rng() * (rScale.max - rScale.min);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 12),
      material
    );
    mesh.position.set(
      (rng() - 0.5) * spread,
      (rng() - 0.5) * 2.5,
      (rng() - 0.5) * spread
    );
    // Flatten heavily so clouds read as a layer, not bubbles
    mesh.scale.set(1.0 + rng() * 0.5, 0.18 + rng() * 0.14, 1.0 + rng() * 0.5);
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
  const count = 2 + Math.floor(rng() * 4);
  const baseH = cityMaxHeight > 0 ? cityMaxHeight * 1.4 : SCALE.towerH.min;

  for (let i = 0; i < count; i += 1) {
    const height = Math.max(baseH * (0.85 + rng() * 0.35), SCALE.towerH.min);
    const width = 3 + rng() * 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, width),
      material
    );
    const taper = 0.82 + rng() * 0.12;
    mesh.scale.x = taper;
    mesh.scale.z = taper;
    mesh.position.set(
      (rng() - 0.5) * 14,
      height / 2,
      (rng() - 0.5) * 14
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
    new THREE.BoxGeometry(SCALE.beachW, 0.3, SCALE.beachD),
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
      new THREE.BoxGeometry(SCALE.beachW, 0.12, SCALE.beachD * 0.6),
      new THREE.MeshStandardMaterial({
        color: 0x2b4b7a,
        roughness: 0.4,
        metalness: 0.2
      })
    );
    water.position.set(0, -0.05, -(SCALE.beachD * 0.65));
    water.receiveShadow = true;
    group.add(water);
  }

  return group;
}

function createPlatformGroup(): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(SCALE.platSize, 0.4, SCALE.platSize),
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
    new THREE.BoxGeometry(SCALE.boxW, SCALE.boxH, SCALE.boxW),
    new THREE.MeshStandardMaterial({
      color: 0x4b5d7a,
      roughness: 0.6,
      metalness: 0.15
    })
  );
  mesh.position.y = SCALE.boxH / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function createUnknownGroup(): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.8, 0),
    new THREE.MeshStandardMaterial({
      color: 0x5a617a,
      emissive: new THREE.Color(0x2a3040),
      emissiveIntensity: 0.25,
      roughness: 0.5,
      metalness: 0.15
    })
  );
  mesh.position.y = 1.5;
  mesh.rotation.y = Math.PI / 4;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.floating = true;
  return group;
}

function createForestGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1a4a2a, roughness: 0.7 });
  const count = 12 + Math.floor(rng() * 14);
  for (let i = 0; i < count; i += 1) {
    const trunkH = SCALE.trunkH.min + rng() * (SCALE.trunkH.max - SCALE.trunkH.min);
    const trunkR = 0.25 + rng() * 0.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.65, trunkR, trunkH, 8), trunkMat);
    trunk.position.set((rng() - 0.5) * SCALE.forestSpread, trunkH / 2, (rng() - 0.5) * SCALE.forestSpread);
    trunk.castShadow = true;
    group.add(trunk);
    const crownR = SCALE.trunkH.min * 0.5 + rng() * (SCALE.crownR.max - SCALE.crownR.min);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(crownR, 10, 10), leafMat);
    crown.position.set(trunk.position.x, trunkH + crownR * 0.6, trunk.position.z);
    crown.castShadow = true;
    group.add(crown);
  }
  return group;
}

function createCastleGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b6259, roughness: 0.8, metalness: 0.1 });
  const keepH = SCALE.castleKeep;
  const keepW = keepH * 0.8;
  const keep = new THREE.Mesh(new THREE.BoxGeometry(keepW, keepH, keepW), wallMat);
  keep.position.y = keepH / 2;
  keep.castShadow = true;
  keep.receiveShadow = true;
  group.add(keep);
  for (let dx = -1; dx <= 1; dx += 2) {
    for (let dz = -1; dz <= 1; dz += 2) {
      const h = SCALE.castleTower.min + rng() * (SCALE.castleTower.max - SCALE.castleTower.min);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, h, 12), wallMat);
      t.position.set(dx * (keepW * 0.55), h / 2, dz * (keepW * 0.55));
      t.castShadow = true;
      group.add(t);
    }
  }
  return group;
}

function createRuinsGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.85, metalness: 0.05 });
  const count = 8 + Math.floor(rng() * 10);
  for (let i = 0; i < count; i += 1) {
    const h = SCALE.ruinsH.min + rng() * (SCALE.ruinsH.max - SCALE.ruinsH.min);
    const w = 1.2 + rng() * 2.4;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    mesh.position.set((rng() - 0.5) * SCALE.ruinsSpread, h / 2, (rng() - 0.5) * SCALE.ruinsSpread);
    mesh.rotation.y = rng() * Math.PI;
    mesh.rotation.z = (rng() - 0.5) * 0.3;
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

function createOceanGroup(_rng: () => number): THREE.Group {
  const group = new THREE.Group();

  // Deep center
  const deep = new THREE.Mesh(
    new THREE.CircleGeometry(SCALE.oceanR * 0.55, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0e2a48,
      roughness: 0.25,
      metalness: 0.18,
      transparent: true,
      opacity: 0.9
    })
  );
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -0.06;
  deep.receiveShadow = true;
  group.add(deep);

  // Mid ocean
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(SCALE.oceanR * 0.82, 64),
    new THREE.MeshStandardMaterial({
      color: 0x1a3a5e,
      roughness: 0.3,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.05;
  water.receiveShadow = true;
  group.add(water);

  // Lighter shallow ring at the edge
  const shallows = new THREE.Mesh(
    new THREE.RingGeometry(SCALE.oceanR * 0.82, SCALE.oceanR, 64),
    new THREE.MeshStandardMaterial({
      color: 0x2e6e96,
      roughness: 0.35,
      metalness: 0.08,
      transparent: true,
      opacity: 0.5
    })
  );
  shallows.rotation.x = -Math.PI / 2;
  shallows.position.y = -0.03;
  shallows.receiveShadow = true;
  group.add(shallows);

  [deep, water, shallows].forEach((m) => {
    m.userData.baseY = m.position.y;
    oceanWaveMeshes.push(m);
  });

  return group;
}

function createStoneGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b6b6e, roughness: 0.85 });
  const count = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i += 1) {
    const r = SCALE.stoneR.min + rng() * (SCALE.stoneR.max - SCALE.stoneR.min);
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    mesh.position.set((rng() - 0.5) * 8, r * 0.6, (rng() - 0.5) * 8);
    mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

function createFragmentGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a8580,
    roughness: 0.7,
    emissive: new THREE.Color(0x2a2520),
    emissiveIntensity: 0.2
  });
  const count = 5 + Math.floor(rng() * 6);
  for (let i = 0; i < count; i += 1) {
    const s = SCALE.fragS.min + rng() * (SCALE.fragS.max - SCALE.fragS.min);
    const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), mat);
    mesh.position.set((rng() - 0.5) * SCALE.fragSpread, 1 + rng() * 4, (rng() - 0.5) * SCALE.fragSpread);
    mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    mesh.castShadow = true;
    group.add(mesh);
  }
  group.userData.floating = true;
  return group;
}

function createCrystalGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x7bb8d4,
    roughness: 0.1,
    metalness: 0.4,
    transparent: true,
    opacity: 0.7
  });
  const count = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < count; i += 1) {
    const h = SCALE.crystalH.min + rng() * (SCALE.crystalH.max - SCALE.crystalH.min);
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rng() * 0.5, h, 6), mat);
    mesh.position.set((rng() - 0.5) * 8, h / 2, (rng() - 0.5) * 8);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

function createBridgeGroup(_rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.8 });
  const span = new THREE.Mesh(new THREE.BoxGeometry(SCALE.bridgeSpan, 0.5, SCALE.bridgeDeck), mat);
  span.position.y = SCALE.bridgePillar;
  span.castShadow = true;
  span.receiveShadow = true;
  group.add(span);
  for (const x of [-SCALE.bridgeSpan * 0.35, SCALE.bridgeSpan * 0.35]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, SCALE.bridgePillar, 0.8), mat);
    p.position.set(x, SCALE.bridgePillar / 2, 0);
    p.castShadow = true;
    group.add(p);
  }
  return group;
}

function createTreeGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const trunkH = SCALE.trunkH.min + rng() * (SCALE.trunkH.max - SCALE.trunkH.min);
  const trunkR = 0.2 + rng() * 0.15;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.65, trunkR, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 })
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);
  const crownR = SCALE.crownR.min + rng() * (SCALE.crownR.max - SCALE.crownR.min);
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(crownR, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x1a4a2a, roughness: 0.7 })
  );
  crown.position.y = trunkH + crownR * 0.6;
  crown.castShadow = true;
  group.add(crown);
  return group;
}

function createMountainGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const h = SCALE.mountainH.min + rng() * (SCALE.mountainH.max - SCALE.mountainH.min);
  const r = SCALE.mountainR.min + rng() * (SCALE.mountainR.max - SCALE.mountainR.min);
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(r, h, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 0.9 })
  );
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.3, h * 0.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.6 })
  );
  cap.position.y = h * 0.85;
  group.add(cap);
  return group;
}

function createPillarGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.7 });
  const count = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i += 1) {
    const h = SCALE.pillarH.min + rng() * (SCALE.pillarH.max - SCALE.pillarH.min);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, h, 12), mat);
    mesh.position.set((rng() - 0.5) * 10, h / 2, (rng() - 0.5) * 10);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

function createStatueGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a9590, roughness: 0.5, metalness: 0.15 });
  const sh = SCALE.statueH;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.8), mat);
  base.position.y = 0.25;
  group.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, sh * 0.56, 10), mat);
  body.position.y = 0.5 + sh * 0.28;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), mat);
  head.position.y = 0.5 + sh * 0.62;
  group.add(head);
  return group;
}

function createGateGroup(_rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.7, metalness: 0.2 });
  const hw = SCALE.gateW / 2;
  for (const x of [-hw, hw]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, SCALE.gateH, 0.8), mat);
    p.position.set(x, SCALE.gateH / 2, 0);
    p.castShadow = true;
    group.add(p);
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(SCALE.gateW + 0.8, 0.7, 0.8), mat);
  arch.position.set(0, SCALE.gateH, 0);
  arch.castShadow = true;
  group.add(arch);
  return group;
}

function createDreamZoneGroup(_rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(SCALE.dreamR, 48),
    new THREE.MeshStandardMaterial({
      color: 0x1a2a3a,
      emissive: new THREE.Color(0x2a4a6a),
      emissiveIntensity: 0.3,
      roughness: 0.6,
      metalness: 0.1
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
