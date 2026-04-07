// @ts-expect-error - CDN ESM import is resolved by the browser at runtime.
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import type { WorldModel, WorldEntity, SemanticTags, ScaleType, EntityType, EnvironmentType, EnvironmentArchetype, LandmarkRole, DreamProfile, ColorPalette, SceneType } from "../core/transform.js";
import { resolveSurfaceProfile } from "./surface.js";
import type { SurfaceProfile } from "./surface.js";
import { accumulateFootstep, resetFootstepAccumulator, setFootstepSurface, playInteractionSound, playLaserFireSound, playLaserHitSound, playDestructionSound, playShockwaveSound, playTelekinesisGrabSound, playTelekinesisThrowSound, startLaserLoop, stopLaserLoop, playBellTollSound, playThunderSound, playDustBurstSound } from "./audio.js";
import { getGeneratorFamily } from "../core/knowledge.js";
import type { GeneratorFamily } from "../core/knowledge.js";

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
const MOVE_SPEED = 14;
const SPRINT_MULTIPLIER = 1.85;
const LOOK_SENSITIVITY = 0.002;
// 16A: Proper character controller constants
const GROUND_ACCEL = 60;       // units/s² — how fast player reaches target speed
const GROUND_FRICTION = 10;    // decel factor when no input
const AIR_ACCEL = 18;          // reduced air authority
const AIR_FRICTION = 0.5;      // minimal air drag
const JUMP_VELOCITY = 9.2;     // impulse, tuned for ~1.5m jump height
const COYOTE_TIME = 0.12;      // seconds you can still jump after walking off edge
const JUMP_BUFFER_TIME = 0.10; // seconds a jump press is remembered before landing
const GROUND_SNAP_DIST = 0.35; // max distance to snap to ground on slopes
const movementVelocity = new THREE.Vector3();  // horizontal velocity (x,z)
let coyoteTimer = 0;
let jumpBufferTimer = 0;
let wasGroundedLastFrame = true;
// 16B: Camera Y smoothing — prevents jitter on uneven terrain
let smoothCameraY = 0;
let smoothCameraInitialized = false;
let lastSize = { width: 0, height: 0 };
const floatingGroups: Array<{ group: THREE.Group; baseY: number; phase: number }> = [];
const cloudJitters: Array<{ mesh: THREE.Mesh; base: THREE.Vector3; phase: number }> = [];
const cityEmissives: Array<{ material: THREE.MeshStandardMaterial; base: number; phase: number }> = [];
const oceanWaveMeshes: THREE.Mesh[] = [];
// 16F: Natural motion tracking
const swayMeshes: Array<{ mesh: THREE.Object3D; baseRotZ: number; phase: number; amplitude: number }> = [];
const waterFlowMeshes: Array<{ mesh: THREE.Mesh; baseY: number; phase: number }> = [];
const FLOAT_AMPLITUDE = 0.45;
const FLOAT_SPEED = 0.65;
const PLAYER_EYE_HEIGHT = 1.7;
const PLAYER_HEIGHT = 1.8;
const DEBUG_VIS = false;

// ── Player embodiment & camera mode ──────────────────────────────────
type CameraMode = "first" | "third";
let cameraMode: CameraMode = "first";
let playerPos = new THREE.Vector3(0, 0, 0); // feet position
let playerSpawnPos = new THREE.Vector3(0, 0, 0); // 16G: saved spawn for reset
let primaryLandmarkWorldPos: THREE.Vector3 | null = null; // 18: used by cinematic look target
let fpArms: THREE.Group | null = null;
let tpAvatar: THREE.Group | null = null;
const TP_OFFSET = new THREE.Vector3(0, 3, 7); // behind + above

// ── Human-scale reference constants ──────────────────────────────────
// All generators use these so the world feels walkable at PLAYER_EYE_HEIGHT.
const SCALE = {
  /** Typical city building */ buildingW: { min: 3, max: 7 },  buildingH: { min: 5, max: 30 },
  /** Landmark tower */       towerH:    { min: 20, max: 40 },
  /** City grid */             citySpacing: 6, cityGrid: 5,
  /** City footprint */        citySpread: 22,
  /** Castle keep */           castleKeep: 12, castleTower: { min: 14, max: 20 },
  /** Tree */                  trunkH: { min: 5, max: 10 }, crownR: { min: 2.5, max: 5 },
  /** Forest spread */         forestSpread: 22,
  /** Cloud blob */            cloudR: { min: 4, max: 10 }, cloudSpread: 22,
  /** Cloud platform (when supporting city) */ cloudPlatR: { min: 12, max: 22 }, cloudPlatSpread: 40,
  /** Bridge */                bridgeSpan: 14, bridgeDeck: 4, bridgePillar: 3.5,
  /** Pillar */                pillarH: { min: 6, max: 14 },
  /** Statue */                statueH: 4.5,
  /** Gate */                  gateH: 7, gateW: 5,
  /** Ruins spread */          ruinsH: { min: 2, max: 7 }, ruinsSpread: 14,
  /** Crystal */               crystalH: { min: 2, max: 6 },
  /** Stone */                 stoneR: { min: 0.6, max: 1.8 },
  /** Fragment */              fragS: { min: 0.4, max: 1 }, fragSpread: 8,
  /** Ocean */                 oceanR: 180,
  /** Beach */                 beachW: 35, beachD: 24,
  /** Mountain */              mountainH: { min: 25, max: 50 }, mountainR: { min: 12, max: 20 },
  /** Dream zone */            dreamR: 12,
  /** Platform fallback */     platSize: 10,
  /** Generic box */           boxH: 2.4, boxW: 1.6,
  /** Ring radius */           ringRadius: { min: 10, max: 22 },
  /** Min spacing */           minSpacing: 5,
  /** Object orbit */          objectOrbit: { min: 4, max: 10 },
  /** Tower orbit */           towerOrbit: { min: 6, max: 12 },
};
let worldSeed = "";
let hasOcean = false;
let cityMaxHeight = 0;
let cloudSupportsCity = false;

// ── 16B: Smooth value noise for terrain ─────────────────────────────
function terrainHash(ix: number, iz: number, seed: number): number {
  // Integer hash → [0, 1] — deterministic, no sin-based artifacts
  let n = (ix * 374761393 + iz * 668265263 + seed) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return ((n & 0x7fffffff) / 0x7fffffff);
}

function smoothNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  // Smoothstep interpolation
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const n00 = terrainHash(ix, iz, seed);
  const n10 = terrainHash(ix + 1, iz, seed);
  const n01 = terrainHash(ix, iz + 1, seed);
  const n11 = terrainHash(ix + 1, iz + 1, seed);
  const nx0 = n00 + sx * (n10 - n00);
  const nx1 = n01 + sx * (n11 - n01);
  return nx0 + sz * (nx1 - nx0);
}

/** Get terrain height at a world-space position */
let terrainSeed = 0;
let terrainAmplitude = 1.5;
const terrainFlattenPoints: THREE.Vector3[] = [];

function getTerrainNoiseY(x: number, z: number): number {
  // 16C: Enhanced terrain — more visible hills with center-to-edge gradient
  // Base octave: broad gentle hills
  let h = (smoothNoise(x * 0.015, z * 0.015, terrainSeed) - 0.5) * 2 * terrainAmplitude;
  // Mid octave: medium detail
  h += (smoothNoise(x * 0.04, z * 0.04, terrainSeed + 100) - 0.5) * 2 * terrainAmplitude * 0.4;
  // Fine octave: small bumps
  h += (smoothNoise(x * 0.1, z * 0.1, terrainSeed + 200) - 0.5) * 2 * terrainAmplitude * 0.15;

  // Edge gradient: terrain is flatter near center, more varied at edges
  // 18F: Wider flat center zone for clear spawn area
  const distFromCenter = Math.sqrt(x * x + z * z);
  const edgeFactor = Math.min(distFromCenter / 70, 1); // ramps up from 0 to 1 over 70 units
  const centerFlatten = 0.1 + edgeFactor * 0.9; // center = 10% height, edge = 100%
  h *= centerFlatten;

  // Flatten near landmarks and spawn
  for (const fp of terrainFlattenPoints) {
    const dx = x - fp.x;
    const dz = z - fp.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const flatRadius = fp.y > 0 ? fp.y : 10;
    if (dist < flatRadius) {
      const blend = dist / flatRadius;
      h *= blend * blend;
    }
  }
  return h;
}

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
let activeArchetype: EnvironmentArchetype | null = null;
let activeSceneType: SceneType = "generic";
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
// 20B: Rain splash rings on ground
let rainSplashes: { mesh: THREE.Mesh; timer: number }[] = [];
const RAIN_SPLASH_MAX = 20;
const rainSplashGeo = new THREE.RingGeometry(0.05, 0.25, 8);
const rainSplashMat = new THREE.MeshBasicMaterial({
  color: 0x88aacc, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false
});
// 16F: Enhanced weather state
let fogWaveTimer = 0;
let fogBaseFar = 300;
let snowGustTimer = 0;
let snowGustActive = false;
let magicSurgeTimer = 0;
let lightningBolt: THREE.Line | null = null;

// ── 14D: Particle & atmosphere system ────────────────────────────────
interface ParticleLayer {
  points: THREE.Points;
  velocities: Float32Array;   // per-particle velocity (3 floats each)
  bounds: number;             // half-extent for reset box
  kind: "ambient" | "magic" | "lava" | "water" | "forest" | "cave" | "star" | "anomaly";
  followCamera: boolean;      // ambient + sky layers follow camera
}
const particleLayers: ParticleLayer[] = [];
const MAX_TOTAL_PARTICLES = 900;
let cameraSway = { phase: 0, enabled: false };

// ── 14E+F: Cinematic intro system ────────────────────────────────────
interface CinematicState {
  active: boolean;
  startTime: number;
  duration: number;            // total fly-in duration in seconds
  startPos: THREE.Vector3;     // high above scene
  endPos: THREE.Vector3;       // final player spawn position at ground
  lookTarget: THREE.Vector3;   // composition center to look at
  onComplete: (() => void) | null;
}
const cinematic: CinematicState = {
  active: false,
  startTime: 0,
  duration: 3,
  startPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(),
  lookTarget: new THREE.Vector3(),
  onComplete: null
};

let currentSurfaceProfile: SurfaceProfile = {
  surface: "generic", groundColor: 0x1a1e28, groundRoughness: 0.94, bobIntensity: 0.6, stepInterval: 0.48
};
let bobPhase = 0;
let isWalking = false;

// ── Physics ──────────────────────────────────────────────────────────
const GRAVITY = 22;        // 16A: tuned for smoother arcs (was 28)
const JUMP_FORCE = JUMP_VELOCITY; // alias for compatibility
let playerVelY = 0;
let isGrounded = true;
// 16H: Anti-stuck recovery
let stuckTimer = 0;
const STUCK_THRESHOLD = 2.0; // seconds of no progress before recovery
let lastProgressPos = new THREE.Vector3();

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

// ── 16C: Lightweight physics layer ───────────────────────────────────
type MassClass = "light" | "medium" | "heavy";
type PhysicsShape = "box" | "sphere" | "cylinder";

interface PhysicsBody {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  mass: number;
  massClass: MassClass;
  shape: PhysicsShape;
  halfExtents: THREE.Vector3;
  grounded: boolean;
  frozen: boolean;       // sleeping / not simulated until hit
  lastHitTime: number;
  lastHitPoint: THREE.Vector3 | null;
  lastHitNormal: THREE.Vector3 | null;
}

const physicsBodies: PhysicsBody[] = [];
const PHYSICS_GRAVITY = 15;
const PHYSICS_DAMPING = 0.92;   // velocity damping per frame
const PHYSICS_SLEEP_VEL = 0.08; // bodies below this speed go to sleep
const PHYSICS_FIXED_DT = 1 / 60;
let physicsAccumulator = 0;

// 16C: Living presence animation tracking
interface LivingEntity {
  group: THREE.Object3D;
  kind: string;
  basePos: THREE.Vector3;
  wanderAngle: number;
  wanderTimer: number;
  idlePhase: number;
  // 16F: Enhanced behavior state
  fleeTimer: number;
  fleeAngle: number;
  pauseTimer: number;
  blinkTimer: number;
}
const livingEntities: LivingEntity[] = [];

// 16F: Landmark event system — timed thematic events on landmarks
interface LandmarkEventEntry {
  group: THREE.Object3D;
  tag: string;         // "bell", "temple", "cave", "lava", "arena", "spire", "ruin", "shrine"
  timer: number;       // countdown to next event
  interval: number;    // base interval
  lastEventTime: number;
}
const landmarkEvents: LandmarkEventEntry[] = [];
// 16F: Bell swing tracking for updateFloating
const bellSwingGroups: Array<{ group: THREE.Object3D; baseRotZ: number; phase: number; ringing: number }> = [];

function massForClass(mc: MassClass): number {
  return mc === "light" ? 1 : mc === "medium" ? 4 : 12;
}

function createPhysicsBody(mesh: THREE.Object3D, massClass: MassClass, shape: PhysicsShape): PhysicsBody {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  return {
    mesh,
    velocity: new THREE.Vector3(),
    mass: massForClass(massClass),
    massClass,
    shape,
    halfExtents: size.multiplyScalar(0.5),
    grounded: false,
    frozen: true,
    lastHitTime: 0,
    lastHitPoint: null,
    lastHitNormal: null,
  };
}

function stepPhysics(delta: number): void {
  physicsAccumulator += delta;
  const maxSteps = 3;
  let steps = 0;
  while (physicsAccumulator >= PHYSICS_FIXED_DT && steps < maxSteps) {
    physicsAccumulator -= PHYSICS_FIXED_DT;
    steps++;
    for (const body of physicsBodies) {
      if (body.frozen) continue;
      // Gravity
      body.velocity.y -= PHYSICS_GRAVITY * PHYSICS_FIXED_DT;
      // Integrate position
      body.mesh.position.addScaledVector(body.velocity, PHYSICS_FIXED_DT);
      // Ground collision
      const gY = getGroundHeightAt(body.mesh.position.x, body.mesh.position.z);
      if (body.mesh.position.y <= gY + body.halfExtents.y * 0.3) {
        body.mesh.position.y = gY + body.halfExtents.y * 0.3;
        if (body.velocity.y < 0) {
          body.velocity.y *= -0.3; // small bounce
          if (Math.abs(body.velocity.y) < 0.5) body.velocity.y = 0;
        }
        body.grounded = true;
        // Extra ground friction
        body.velocity.x *= 0.85;
        body.velocity.z *= 0.85;
      } else {
        body.grounded = false;
      }
      // Damping
      body.velocity.multiplyScalar(PHYSICS_DAMPING);
      // Sleep check
      if (body.velocity.lengthSq() < PHYSICS_SLEEP_VEL * PHYSICS_SLEEP_VEL && body.grounded) {
        body.velocity.set(0, 0, 0);
        body.frozen = true;
      }
    }
  }
}

function applyImpulse(body: PhysicsBody, impulse: THREE.Vector3): void {
  body.frozen = false;
  const invMass = 1 / body.mass;
  body.velocity.addScaledVector(impulse, invMass);
}

function findPhysicsBody(mesh: THREE.Object3D): PhysicsBody | null {
  // Check the mesh itself and its ancestors up to worldGroup
  let current: THREE.Object3D | null = mesh;
  while (current && current !== worldGroup) {
    const found = physicsBodies.find(b => b.mesh === current);
    if (found) return found;
    current = current.parent;
  }
  return null;
}

function disposePhysics(): void {
  physicsBodies.length = 0;
  physicsAccumulator = 0;
  livingEntities.length = 0;
}

// ── Gameplay state ───────────────────────────────────────────────────


// ── UI element refs (set at init) ────────────────────────────────────
let interactionHint: HTMLElement | null = null;
let feedbackText: HTMLElement | null = null;

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


  canvas.addEventListener("click", () => {
    if (!pointerLocked) {
      canvas.requestPointerLock();
    }
  });

  // 16E: Mouse button for power activation — hold-to-fire for laser & hold-to-grab for telekinesis
  document.addEventListener("mousedown", (event) => {
    if (!pointerLocked || !controlsEnabled) return;
    if (event.button === 0) {
      powerUsePressed = true;
      if (currentPower === "laser") {
        startLaserFiring();
      } else if (currentPower === "telekinesis" && !telekinesisTarget) {
        grabTelekinesisTarget();
      } else {
        usePower();
      }
    }
  });
  document.addEventListener("mouseup", (event) => {
    if (event.button === 0) {
      powerUsePressed = false;
      if (currentPower === "laser" && laserFiring) {
        stopLaserFiring();
      } else if (currentPower === "telekinesis" && telekinesisTarget) {
        dropTelekinesisTarget();
      }
    }
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
    // 16A: Jump with coyote time + jump buffering
    if (event.code === "Space") {
      if (isGrounded || coyoteTimer > 0) {
        playerVelY = JUMP_VELOCITY;
        isGrounded = false;
        coyoteTimer = 0;
        jumpBufferTimer = 0;
      } else {
        jumpBufferTimer = JUMP_BUFFER_TIME;
      }
    }
    // 16E: Power switching
    if (event.code === "Digit1") activatePower("none");
    if (event.code === "Digit2") activatePower("flight");
    if (event.code === "Digit3") activatePower("laser");
    if (event.code === "Digit4") activatePower("telekinesis");
    if (event.code === "Digit5") activatePower("destruction");
    if (event.code === "Digit6") activatePower("shockwave");
  });

  document.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.code);
  });

  // 16E: Scroll wheel to adjust telekinesis hold distance
  document.addEventListener("wheel", (event) => {
    if (!pointerLocked || !controlsEnabled) return;
    if (currentPower === "telekinesis" && telekinesisTarget) {
      telekinesisHoldDist += event.deltaY > 0 ? -0.8 : 0.8;
      telekinesisHoldDist = Math.max(3, Math.min(18, telekinesisHoldDist));
      event.preventDefault();
    }
  }, { passive: false });

  const animate = () => {
    if (renderer && scene && camera) {
      const now = performance.now();
      const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
      lastFrame = now;
      resizeRenderer(canvas, false);

      // 14E+F: Cinematic fly-in takes over camera during intro
      if (cinematic.active) {
        updateCinematic(dt);
        updateParticles(dt);
        updateWeather(dt);
        updateFloating();
      } else {
        updateMovement(dt);
        updateInteraction();
        updateFloating();
        updateWeather(dt);
        updateParticles(dt);
        updateCameraSway(dt);
        updateStreaming();
        // 16C: Physics + living entity animation
        stepPhysics(dt);
        updateLivingEntities(dt);
        updateLandmarkEvents(dt);
      }
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

  // 16B: Increment session variation for subtle placement changes
  sessionVariation += 1;

  const signature = world.entities.map((entity) => entity.attributes.name).join("|");
  const rng = seededRandom(signature);
  worldSeed = signature;
  hasOcean = world.entities.some((entity) => entity.attributes.name === "ocean");
  cityMaxHeight = 0;

  // Store semantics for streaming & scale
  activeSemantics = world.semantics;
  activeArchetype = world.archetype;
  activeSceneType = world.sceneType ?? "generic";
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
    new THREE.PlaneGeometry(260, 260, 80, 80),
    new THREE.MeshStandardMaterial({
      color: currentSurfaceProfile.groundColor,
      roughness: currentSurfaceProfile.groundRoughness,
      metalness: 0.02,
      side: THREE.DoubleSide
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  // 16A-D: Environment-aware terrain noise amplitude
  terrainSeed = rng() * 10000;
  // Beach/ocean: very flat. Forest/ruins: varied hills. Desert: rolling. Arena/temple: flatten center
  const archetype = world.archetype;
  if (hasOcean || archetype === "ocean_realm") {
    terrainAmplitude = 0.4;
  } else if (archetype === "forest_ruins") {
    terrainAmplitude = 3.5;
  } else if (archetype === "surreal_desert") {
    terrainAmplitude = 2.5;
  } else if (archetype === "storm_void") {
    terrainAmplitude = 1.5;
  } else {
    terrainAmplitude = 2.0;
  }
  // 19H/20B: Arena/temple scenes get flat floors (interior removed)
  if (activeSceneType === "arena") {
    terrainAmplitude = 0;
  } else if (activeSceneType === "temple") {
    terrainAmplitude = 0.3;
  }
  terrainFlattenPoints.length = 0;
  {
    const posAttr = ground.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      // CircleGeometry is XY plane, rotated to XZ — so X stays, Y becomes Z after rotation
      const gx = posAttr.getX(i);
      const gy = posAttr.getY(i);
      const h = getTerrainNoiseY(gx, gy);
      posAttr.setZ(i, h); // Z in local space = Y in world after -PI/2 rotation
    }
    posAttr.needsUpdate = true;
    ground.geometry.computeVertexNormals();
  }

  worldGroup.add(ground);

  // ── 18B/19B/20B: Scene-specific enclosure geometry (cave + temple only) ──
  if (activeSceneType === "cave" || activeSceneType === "temple") {
    const ceilH = activeSceneType === "cave" ? 18 : 14;
    const ceilSize = activeSceneType === "cave" ? 100 : 65;
    const ceilColor = activeSceneType === "cave" ? 0x2a2a2e : 0x6a6a64;
    const ceilMat = new THREE.MeshStandardMaterial({
      color: ceilColor, roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide
    });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ceilSize, ceilSize, 1, 1), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = ceilH;
    ceiling.receiveShadow = true;
    worldGroup.add(ceiling);

    // 18B: Stalactites for cave ceilings
    if (activeSceneType === "cave") {
      const stalMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.9 });
      for (let si = 0; si < 25; si++) {
        const h = 1 + rng() * 4;
        const r = 0.2 + rng() * 0.5;
        const stal = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), stalMat);
        stal.rotation.x = Math.PI; // hang from ceiling
        const dist = rng() * 40;
        const angle = rng() * Math.PI * 2;
        stal.position.set(Math.cos(angle) * dist, ceilH - h / 2, Math.sin(angle) * dist);
        worldGroup.add(stal);
      }
    }

    // 18B: Arched pillars for temples
    if (activeSceneType === "temple") {
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0x7a7a74, roughness: 0.6, metalness: 0.1 });
      const pillarCount = 8;
      const pillarRadius = 22;
      for (let pi = 0; pi < pillarCount; pi++) {
        const angle = (pi / pillarCount) * Math.PI * 2;
        const pH = ceilH - 0.5;
        const pR = 0.6;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(pR * 0.75, pR, pH, 8), pillarMat);
        pillar.position.set(Math.cos(angle) * pillarRadius, pH / 2, Math.sin(angle) * pillarRadius);
        pillar.castShadow = true;
        worldGroup.add(pillar);
      }
    }
  }

  const groupById: GroupMap = new Map();
  const entityById = new Map<string, WorldEntity>();
  floatingGroups.length = 0;
  cloudJitters.length = 0;
  cityEmissives.length = 0;
  oceanWaveMeshes.length = 0;
  swayMeshes.length = 0;
  waterFlowMeshes.length = 0;
  landmarkEvents.length = 0;
  bellSwingGroups.length = 0;

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
    (world.primaryLandmarkId ? world.entities.find((e) => e.id === world.primaryLandmarkId) : null) ??
    world.entities.find((entity) => entity.attributes.name === "city") ??
    world.entities.find((entity) => entity.type === "place") ??
    world.entities[0];

  if (anchor) {
    placeEntity(anchor, new THREE.Vector3(0, baseYForEntity(anchor), 0));
    // 16A-D: Flatten terrain around primary landmark (y=radius for the flatten fn)
    terrainFlattenPoints.push(new THREE.Vector3(0, 14, 0));
  }

  const otherPlaces = world.entities.filter(
    (entity) => entity.type === "place" && entity.id !== anchor?.id
  );

  // ── 17D: Scene-aware layout bias ──────────────────────────────────
  // Adjust placement radii and offset based on scene type
  const layoutCompact = ((): number => {
    switch (activeSceneType) {
      case "cave": return 0.55;
      case "temple": return 0.65;
      case "arena": return 0.65;
      case "city": return 0.8;       // 20B: cities need more spread
      case "beach": return 0.85;
      default: return 1.0;
    }
  })();
  // Beach: push objects toward positive-Z (away from water at negative-Z)
  const layoutBiasX = activeSceneType === "beach" ? 0 : 0;
  const layoutBiasZ = activeSceneType === "beach" ? 4 : 0;

  // ── 14C: Zone-based placement ─────────────────────────────────────
  // Secondary landmarks → mid zone (20-50 units)
  // Background places → outer zone (50-80 units)
  // Other places → ring
  const secondaryEntities = otherPlaces.filter((e) => e.landmarkRole === "secondary_landmark");
  const backgroundEntities = otherPlaces.filter((e) => e.landmarkRole === "background");
  const otherNonRoled = otherPlaces.filter(
    (e) => e.landmarkRole !== "secondary_landmark" && e.landmarkRole !== "background"
  );

  // Place secondary landmarks in mid zone with even angular spacing
  const secStep = secondaryEntities.length > 0 ? (Math.PI * 2) / secondaryEntities.length : 0;
  secondaryEntities.forEach((entity, index) => {
    const angle = secStep * index + (rng() - 0.5) * 0.4;
    const radius = (8 + rng() * 10) * layoutCompact;
    const pos = new THREE.Vector3(
      Math.cos(angle) * radius + layoutBiasX,
      baseYForEntity(entity),
      Math.sin(angle) * radius + layoutBiasZ
    );
    placeEntity(entity, pos);
    // 16A-D: Flatten terrain around secondary landmarks
    terrainFlattenPoints.push(new THREE.Vector3(pos.x, 8, pos.z));
  });

  // Place background places in outer zone
  const bgStep = backgroundEntities.length > 0 ? (Math.PI * 2) / backgroundEntities.length : 0;
  backgroundEntities.forEach((entity, index) => {
    const angle = bgStep * index + (rng() - 0.5) * 0.5 + 0.3;
    const radius = (18 + rng() * 12) * layoutCompact;
    const pos = new THREE.Vector3(
      Math.cos(angle) * radius + layoutBiasX,
      baseYForEntity(entity),
      Math.sin(angle) * radius + layoutBiasZ
    );
    placeEntity(entity, pos);
  });

  // Remaining places fill the ring
  const ringRadius = (SCALE.ringRadius.min + rng() * (SCALE.ringRadius.max - SCALE.ringRadius.min)) * layoutCompact;
  const step = otherNonRoled.length > 0 ? (Math.PI * 2) / otherNonRoled.length : 0;
  otherNonRoled.forEach((entity, index) => {
    const angle = step * index + (rng() - 0.5) * 0.4;
    const radius = ringRadius + (rng() - 0.5) * 2;
    const pos = new THREE.Vector3(
      Math.cos(angle) * radius + layoutBiasX,
      baseYForEntity(entity),
      Math.sin(angle) * radius + layoutBiasZ
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
    const radius = (entity.type === "object"
      ? SCALE.objectOrbit.min + rng() * (SCALE.objectOrbit.max - SCALE.objectOrbit.min)
      : SCALE.ringRadius.min * 0.5 + rng() * 10) * layoutCompact;
    const pos = new THREE.Vector3(
      origin.x + Math.cos(angle) * radius + layoutBiasX,
      baseYForEntity(entity),
      origin.z + Math.sin(angle) * radius + layoutBiasZ
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

  // ── 14B: Archetype-aware world building ────────────────────────────
  buildArchetypeEnvironment(rng, world.archetype, world.semantics, placedPositions, activeScaleMultiplier, world.dreamProfile);
  applyCompositionRules(rng, world, groupById, placedPositions, activeScaleMultiplier);
  placeLandmarksAndPaths(rng, world.archetype, world.semantics, placedPositions, activeScaleMultiplier);
  populateBackground(rng, world.archetype, world.semantics, activeScaleMultiplier);

  // ── 14C: Visual hierarchy & landmark enhancement ──────────────────
  applyVisualHierarchy(rng, world, groupById, activeScaleMultiplier);
  layPathTowardPrimary(rng, world, groupById, placedPositions, activeScaleMultiplier);

  // ── 14D: Particles & atmosphere ────────────────────────────────────
  disposeParticles();
  const skyProfile14D = resolveSkyProfile(world);
  spawnAmbientParticles(rng);
  spawnLandmarkParticles(rng, world, groupById);
  spawnSkyParticles(rng, skyProfile14D.mode);
  cameraSway.enabled = true;

  // ── 14A: Populate density layers (ground / mid / upper / background)
  populateDensityLayers(rng, world.semantics, placedPositions, activeScaleMultiplier);

  setupFloatingGroups(groupById);
  collectNaturalMotion();

  // ── 20B: Placement validation — clamp stray objects inside supported ground ──
  {
    const groundHalfSize = 125; // ground plane is 260×260 → ±130, keep margin of 5
    placedPositions.forEach((pos) => {
      pos.x = Math.max(-groundHalfSize, Math.min(groundHalfSize, pos.x));
      pos.z = Math.max(-groundHalfSize, Math.min(groundHalfSize, pos.z));
    });
    // Also clamp any group that drifted out
    groupById.forEach((group) => {
      if (Math.abs(group.position.x) > groundHalfSize) {
        group.position.x = Math.sign(group.position.x) * groundHalfSize;
      }
      if (Math.abs(group.position.z) > groundHalfSize) {
        group.position.z = Math.sign(group.position.z) * groundHalfSize;
      }
    });
  }

  // ── 20B: Ground skirt — extended flat ring to cover void at scene edges ──
  if (worldGroup) {
    const contentBounds = new THREE.Box3();
    worldGroup.children.forEach((child: THREE.Object3D) => {
      if (child === ground) return; // skip ground plane itself
      const cb = new THREE.Box3().setFromObject(child);
      if (!cb.isEmpty()) contentBounds.expandByPoint(cb.min).expandByPoint(cb.max);
    });
    const contentRadius = Math.max(
      Math.abs(contentBounds.min.x), Math.abs(contentBounds.max.x),
      Math.abs(contentBounds.min.z), Math.abs(contentBounds.max.z),
      80 // minimum skirt
    );
    const skirtSize = Math.max(contentRadius * 2.4, 320);
    const existingSize = 260;
    if (skirtSize > existingSize + 20) {
      const skirtMat = new THREE.MeshStandardMaterial({
        color: currentSurfaceProfile.groundColor,
        roughness: currentSurfaceProfile.groundRoughness + 0.05,
        metalness: 0.01, side: THREE.DoubleSide
      });
      const skirt = new THREE.Mesh(
        new THREE.PlaneGeometry(skirtSize, skirtSize, 1, 1),
        skirtMat
      );
      skirt.rotation.x = -Math.PI / 2;
      skirt.position.y = -0.05; // slightly below main terrain to avoid z-fight
      skirt.receiveShadow = true;
      worldGroup.add(skirt);
    }
  }

  const worldBounds = new THREE.Box3().setFromObject(worldGroup);
  if (worldBounds.isEmpty()) return;
  const center = worldBounds.getCenter(new THREE.Vector3());
  worldGroup.position.sub(center);

  // ── 15A: Track ground-plane world-space Y after centering ──────────
  groundBaseY = worldGroup.position.y;

  // Tune fog to scene scale + scene type (18G)
  const size = new THREE.Box3().setFromObject(worldGroup).getSize(new THREE.Vector3());
  const sceneRadius = Math.max(size.x, size.z) * 0.5;
  if (scene && scene.fog instanceof THREE.Fog) {
    let fogNearMul = 0.4;
    let fogFarMul = 3.5;
    switch (activeSceneType) {
      case "cave": fogNearMul = 0.15; fogFarMul = 1.8; break;
      case "forest": fogNearMul = 0.25; fogFarMul = 2.5; break;
      case "desert": fogNearMul = 0.5; fogFarMul = 5.0; break;
      case "ocean": case "beach": fogNearMul = 0.3; fogFarMul = 4.0; break;
      case "mountain": fogNearMul = 0.35; fogFarMul = 4.5; break;
      default: break;
    }
    scene.fog.near = Math.max(sceneRadius * fogNearMul, 15);
    // 20E: Higher fog far minimum for flight visibility
    scene.fog.far = Math.max(sceneRadius * fogFarMul, 220);
    fogBaseFar = scene.fog.far; // 16F: Capture for fog wave modulation
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

  // 20B: Consistent spawn distance for all scenes
  const spawnDist = 14 + rng() * 8;
  if (camera) {
    const spawnX = spawnTarget.x + Math.cos(spawnAngle) * spawnDist;
    const spawnZ = spawnTarget.z + Math.sin(spawnAngle) * spawnDist;

    // 16A-D/18F: Flatten terrain around spawn point (wider for readability)
    terrainFlattenPoints.push(new THREE.Vector3(spawnX, 12, spawnZ));

    // ── 15A: Grounded spawn — clamp to actual ground surface ─────────
    // Build collision first so getGroundHeightAt can probe surfaces
    buildCollisionBoxes();

    // 16C: Register physics bodies for movable objects
    registerPhysicsBodies();
    // 16C: Register living entity animations
    registerLivingEntities();
    // 16F: Register landmark event system
    registerLandmarkEvents();

    // Probe ground at candidate spawn; use groundBaseY as fallback
    playerPos.set(spawnX, groundBaseY + 50, spawnZ); // temp high Y for probing
    playerVelY = 0;
    let spawnGroundY = getGroundHeightAt(spawnX, spawnZ);

    // 15A: If camera would spawn inside a collision volume, nudge backward
    if (collidesAt(spawnX, spawnGroundY, spawnZ)) {
      for (let nudge = 2; nudge <= 12; nudge += 2) {
        const nx = spawnX + Math.cos(spawnAngle + Math.PI) * nudge;
        const nz = spawnZ + Math.sin(spawnAngle + Math.PI) * nudge;
        const ny = getGroundHeightAt(nx, nz);
        if (!collidesAt(nx, ny, nz)) {
          spawnGroundY = ny;
          playerPos.set(nx, spawnGroundY, nz);
          break;
        }
      }
    }

    if (playerPos.x === spawnX && playerPos.z === spawnZ) {
      playerPos.set(spawnX, spawnGroundY, spawnZ);
    }
    // 20A: Flight-first — elevate spawn position so player starts airborne
    if (currentPower === "flight" && flightActive) {
      playerPos.y = Math.max(playerPos.y, spawnGroundY) + 12;
    }
    playerSpawnPos.copy(playerPos); // 16G: save spawn for reset
    camera.position.set(playerPos.x, playerPos.y + PLAYER_EYE_HEIGHT, playerPos.z);

    // ── 15G: Face player toward primary landmark ─────────────────────
    const lookTarget = anchorGroup
      ? anchorGroup.getWorldPosition(new THREE.Vector3())
      : compositionCenter;
    // 18: Store primary landmark world position for cinematic look target
    primaryLandmarkWorldPos = lookTarget.clone();
    const lookY = playerPos.y + PLAYER_EYE_HEIGHT;
    camera.lookAt(lookTarget.x, lookY, lookTarget.z);
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
  oceanWaveMeshes.length = 0;
  swayMeshes.length = 0;
  waterFlowMeshes.length = 0;
  landmarkEvents.length = 0;
  bellSwingGroups.length = 0;

  // 20B: Clean up rain splashes
  rainSplashes.forEach((sp) => {
    sp.mesh.parent?.remove(sp.mesh);
    (sp.mesh.material as THREE.Material).dispose();
  });
  rainSplashes.length = 0;

  // 14D: Dispose particle layers
  disposeParticles();

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
  weatherWindStrength = 0;
  groundBaseY = 0;

  // Clean up streaming chunks
  loadedChunks.clear();
  streamingEnabled = false;
  activeSemantics = null;
  activeArchetype = null;
  collisionBoxes.length = 0;
  playerVelY = 0;
  isGrounded = true;
  // 16A: Reset controller & power state
  coyoteTimer = 0;
  jumpBufferTimer = 0;
  movementVelocity.set(0, 0, 0);
  stuckTimer = 0;
  smoothCameraInitialized = false;
  // 16B: Reset power state
  if (telekinesisTarget) dropTelekinesisTarget();
  laserCooldown = 0;
  destructionCooldown = 0;
  powerUsePressed = false;
  // 16C: Dispose physics
  disposePhysics();
  // 20A: Flight stays default across world regeneration
  activatePower("flight");
}

export function setControlsEnabled(enabled: boolean): void {
  controlsEnabled = enabled;
  if (!enabled) pressedKeys.clear();
}

function createGroupForEntity(entity: WorldEntity): THREE.Group {
  const name = entity.attributes.name;
  const rng = seededRandom(`${worldSeed}|${name}`);

  // 1. Exact dictionary match
  const generator = dictionaryGenerators[name];
  let group: THREE.Group;
  if (generator) {
    group = generator(rng);
  } else {
    // 2. Family-based generation via knowledge base
    const familyInfo = getGeneratorFamily(name);
    if (familyInfo) {
      const familyGen = familyGenerators[familyInfo.family];
      if (familyGen) {
        group = familyGen(rng, familyInfo.variant);
      } else if (entity.type === "place") {
        group = createPlatformGroup();
      } else {
        group = createBoxGroup();
      }
    } else if (entity.type === "place") {
      group = createPlatformGroup();
    } else if (entity.type === "object") {
      group = createBoxGroup();
    } else {
      group = createUnknownGroup();
    }
  }

  // Tag for interaction / collision / gameplay
  const tag = resolveInteractionTag(name, entity.type);
  group.userData.interactionTag = tag;
  group.userData.entityName = name; // 16F: Store original entity name for reactive events
  group.traverse((child: THREE.Object3D) => { child.userData.interactionTag = tag; });

  // 16C: Physics-aware tagging — determine mass class and movability
  const MOVABLE_NAMES = new Set([
    "fragment", "fragments", "stone", "stones", "rock", "rocks",
    "bell", "skull", "bone", "cage", "chain", "book", "flag",
    "crate", "barrel", "debris", "shard", "shards", "mushroom",
    "flower", "vine", "root",
  ]);
  const HEAVY_NAMES = new Set(["pillar", "pillars", "statue", "statues", "altar", "throne"]);

  if (MOVABLE_NAMES.has(name)) {
    group.userData.movable = true;
    group.userData.destructible = true;
    group.userData.massClass = "light" as MassClass;
    group.userData.physicsShape = "box" as PhysicsShape;
    group.userData.structuralImportance = "low";
  } else if (HEAVY_NAMES.has(name)) {
    group.userData.movable = true;
    group.userData.destructible = true;
    group.userData.massClass = "heavy" as MassClass;
    group.userData.physicsShape = "box" as PhysicsShape;
    group.userData.structuralImportance = "medium";
  } else if (tag === "interactive" || tag === "landmark") {
    group.userData.movable = true;
    group.userData.destructible = true;
    group.userData.massClass = (tag === "landmark" ? "medium" : "light") as MassClass;
    group.userData.physicsShape = "box" as PhysicsShape;
    group.userData.structuralImportance = tag === "landmark" ? "medium" : "low";
  } else if (tag === "structure") {
    group.userData.movable = false;
    group.userData.destructible = true;
    group.userData.structuralImportance = "high";
  }

  return group;
}

function resolveInteractionTag(name: string, type: EntityType): string {
  const structures = ["city", "castle", "tower", "towers", "ruins", "ruin", "temple", "palace",
    "village", "bridge", "bridges", "gate", "gates", "arena", "library", "pyramid",
    "dome", "arch", "steeple", "lighthouse", "windmill", "fountain", "monument"];
  const landmarks = ["statue", "statues", "pillar", "pillars", "crystal", "crystals",
    "dream zone", "mirror", "orb", "bell", "altar", "throne", "campfire"];
  const envClouds = ["cloud", "clouds"];
  const envBackground = ["ocean", "sea", "lake", "river", "beach", "forest", "mountain",
    "glacier", "tundra", "desert", "oasis", "volcano", "canyon", "valley", "marsh",
    "reef", "harbor", "island", "field", "plateau"];
  const interactive = ["tree", "trees", "stone", "stones", "rock", "rocks",
    "fragment", "fragments", "vine", "root", "mushroom", "flower",
    "skull", "bone", "cage", "chain", "book", "flag"];

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

    // ── Iter 16: expanded descriptor effects ──────────────────────
    if (name === "golden")  material.color = new THREE.Color(0xd4a843);
    if (name === "silver")  material.color = new THREE.Color(0xb0b8c4);
    if (name === "crimson") material.color = new THREE.Color(0x8b1a1a);
    if (name === "emerald") material.color = new THREE.Color(0x2e7d32);
    if (name === "azure")   material.color = new THREE.Color(0x1565c0);
    if (name === "ivory")   material.color = new THREE.Color(0xf5f0e0);
    if (name === "copper")  { material.color = new THREE.Color(0xb87333); material.metalness = Math.max(material.metalness, 0.5); }
    if (name === "purple")  material.color = new THREE.Color(0x6a1b9a);
    if (name === "neon")    { material.emissive = new THREE.Color(0x00e5ff); material.emissiveIntensity = 0.6; }
    if (name === "frozen")  { material.color = new THREE.Color(0xb0d4e8); material.roughness = 0.05; material.metalness = 0.2; }
    if (name === "burning") { material.emissive = new THREE.Color(0xff4400); material.emissiveIntensity = 0.5; }
    if (name === "marble")  { material.color = new THREE.Color(0xe8e4de); material.roughness = 0.15; material.metalness = 0.08; }
    if (name === "wooden")  { material.color = new THREE.Color(0x6d4c2a); material.roughness = 0.9; material.metalness = 0; }
    if (name === "rusty")   { material.color = new THREE.Color(0x8b4513); material.roughness = 0.95; }
    if (name === "shimmering" || name === "pulsing") {
      material.emissive = new THREE.Color(0x88ccee);
      material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.35);
    }
    if (name === "ancient" || name === "ruined" || name === "forgotten") {
      material.color.multiplyScalar(0.7);
      material.roughness = Math.min(material.roughness + 0.15, 1);
    }
    if (name === "overgrown") {
      material.color.lerp(new THREE.Color(0x2a5a2a), 0.3);
    }
    if (name === "cursed" || name === "haunted") {
      material.color.multiplyScalar(0.6);
      material.emissive = new THREE.Color(0x220022);
      material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.2);
    }
    if (name === "mechanical") {
      material.metalness = Math.max(material.metalness, 0.6);
      material.roughness = Math.min(material.roughness, 0.3);
    }
    if (name === "inverted") {
      target.rotation.x = Math.PI;
    }
    if (name === "submerged") {
      target.position.y -= 3;
      material.transparent = true;
      material.opacity = Math.min(material.opacity, 0.7);
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

  // ── 16A-C: Read gamepad input ──────────────────────────────────────
  const gp = pollGamepad();
  if (gp) {
    // Right stick → look
    yaw -= gp.lookX * 3.0 * delta;
    pitch -= gp.lookY * 2.0 * delta;
    const limit = Math.PI / 2 - 0.05;
    pitch = Math.max(-limit, Math.min(limit, pitch));
  }

  // Direction vectors (yaw-only, ground-projected)
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  // ── Build desired direction from keyboard + gamepad ────────────────
  const inputDir = new THREE.Vector3();
  if (pressedKeys.has("KeyW")) inputDir.add(forward);
  if (pressedKeys.has("KeyS")) inputDir.addScaledVector(forward, -1);
  if (pressedKeys.has("KeyA")) inputDir.addScaledVector(right, -1);
  if (pressedKeys.has("KeyD")) inputDir.add(right);
  // Blend in gamepad left stick
  if (gp && (Math.abs(gp.moveX) > 0.01 || Math.abs(gp.moveY) > 0.01)) {
    inputDir.addScaledVector(forward, -gp.moveY);
    inputDir.addScaledVector(right, gp.moveX);
  }
  // Gamepad jump
  if (gp && gp.jump) {
    if (isGrounded || coyoteTimer > 0) {
      playerVelY = JUMP_VELOCITY;
      isGrounded = false;
      coyoteTimer = 0;
      jumpBufferTimer = 0;
    } else {
      jumpBufferTimer = JUMP_BUFFER_TIME;
    }
  }

  const hasInput = inputDir.lengthSq() > 0.001;
  if (hasInput) inputDir.normalize();

  const sprinting = pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight") || (gp?.sprint ?? false);
  const inFlight = currentPower === "flight" && flightActive;
  const targetSpeed = hasInput
    ? (inFlight ? MOVE_SPEED * 1.3 : (sprinting && isGrounded ? MOVE_SPEED * SPRINT_MULTIPLIER : MOVE_SPEED))
    : 0;

  // ── 16A: Acceleration-based horizontal movement ────────────────────
  const accel = inFlight ? GROUND_ACCEL * 1.4 : (isGrounded ? GROUND_ACCEL : AIR_ACCEL);
  const friction = inFlight ? GROUND_FRICTION * 0.6 : (isGrounded ? GROUND_FRICTION : AIR_FRICTION);

  if (hasInput) {
    // Accelerate toward desired direction
    const desired = inputDir.clone().multiplyScalar(targetSpeed);
    const diff = desired.clone().sub(movementVelocity);
    const step = diff.clone().multiplyScalar(Math.min(1, accel * delta / Math.max(diff.length(), 0.001)));
    movementVelocity.add(step);
  } else {
    // Decelerate via friction
    const speed = movementVelocity.length();
    if (speed > 0.01) {
      const drop = speed * friction * delta;
      const scale = Math.max(0, speed - drop) / speed;
      movementVelocity.multiplyScalar(scale);
    } else {
      movementVelocity.set(0, 0, 0);
    }
  }

  // Clamp max horizontal speed
  const maxH = inFlight ? MOVE_SPEED * 1.5 : MOVE_SPEED * SPRINT_MULTIPLIER * 1.05;
  if (movementVelocity.length() > maxH) {
    movementVelocity.normalize().multiplyScalar(maxH);
  }

  const moveDelta = movementVelocity.clone().multiplyScalar(delta);

  // ── Horizontal collision (split axis) — skip during flight ────────
  const newX = playerPos.x + moveDelta.x;
  const newZ = playerPos.z + moveDelta.z;
  if (inFlight) {
    playerPos.x = newX;
    playerPos.z = newZ;
  } else {
    if (!collidesAt(newX, playerPos.y, playerPos.z)) {
      playerPos.x = newX;
    } else {
      movementVelocity.x *= -0.1;
    }
    if (!collidesAt(playerPos.x, playerPos.y, newZ)) {
      playerPos.z = newZ;
    } else {
      movementVelocity.z *= -0.1;
    }
  }

  // ── 16A: Vertical physics — gravity, jump, coyote ─────────────────
  // 16F: Flight power overrides gravity
  if (currentPower === "flight" && flightActive) {
    updateFlightMovement(delta, forward, right);
  } else {
    playerVelY -= GRAVITY * delta;
    playerPos.y += playerVelY * delta;
  }

  // ── 16A: Coyote time — count down after leaving ground ────────────
  if (isGrounded) {
    coyoteTimer = COYOTE_TIME;
  } else {
    coyoteTimer -= delta;
  }

  // ── Ground detection with gentle snap ──────────────────────────────
  const groundY = getGroundHeight(playerPos.x, playerPos.z);

  if (currentPower !== "flight" || !flightActive) {
    if (playerPos.y <= groundY + GROUND_SNAP_DIST && playerVelY <= 0) {
      // Snap gently to ground surface
      playerPos.y = groundY;
      playerVelY = 0;
      if (!isGrounded) {
        // Just landed — consume jump buffer if pressed before landing
        isGrounded = true;
        if (jumpBufferTimer > 0) {
          playerVelY = JUMP_VELOCITY;
          isGrounded = false;
          jumpBufferTimer = 0;
        }
      }
      isGrounded = playerVelY === 0; // re-check after possible buffer jump
    } else {
      isGrounded = false;
    }
  }

  // ── 16A: Tick down jump buffer ─────────────────────────────────────
  jumpBufferTimer -= delta;
  wasGroundedLastFrame = isGrounded;

  // ── 16H: Anti-stuck recovery ───────────────────────────────────────
  if (hasInput) {
    const progressDist = playerPos.distanceTo(lastProgressPos);
    if (progressDist < 0.05) {
      stuckTimer += delta;
      if (stuckTimer > STUCK_THRESHOLD) {
        playerPos.y += 3;
        playerPos.x += forward.x * 2;
        playerPos.z += forward.z * 2;
        playerVelY = 0;
        stuckTimer = 0;
      }
    } else {
      stuckTimer = 0;
    }
  } else {
    stuckTimer = 0;
  }
  lastProgressPos.copy(playerPos);

  // 16H: Void fallback
  if (playerPos.y < groundBaseY - 20) {
    playerPos.y = groundBaseY + 3;
    playerVelY = 0;
  }

  // ── Walking detection and footstep accumulation ────────────────────
  const hSpeed = Math.sqrt(movementVelocity.x ** 2 + movementVelocity.z ** 2);
  const wasWalking = isWalking;
  isWalking = controlsEnabled && hSpeed > 0.5;

  // 16B: Subtle head bob — greatly reduced from prior iteration
  let bobY = 0;
  let bobX = 0;
  if (isWalking && isGrounded) {
    const hDist = Math.sqrt(moveDelta.x ** 2 + moveDelta.z ** 2);
    accumulateFootstep(hDist);
    bobPhase += delta * hSpeed * 1.4;
    const bobAmt = currentSurfaceProfile.bobIntensity * 0.45; // halved intensity
    bobY = Math.sin(bobPhase * 2) * 0.008 * bobAmt;
    bobX = Math.cos(bobPhase) * 0.004 * bobAmt;
  } else {
    if (wasWalking) resetFootstepAccumulator();
    bobPhase *= 0.85;
  }

  // ── Avatar positioning ─────────────────────────────────────────────
  if (tpAvatar) {
    tpAvatar.position.set(playerPos.x, playerPos.y, playerPos.z);
    tpAvatar.rotation.y = yaw;
  }

  // ── 16B: Smooth camera Y — lerp to avoid jitter on uneven terrain ─
  if (!smoothCameraInitialized) {
    smoothCameraY = playerPos.y;
    smoothCameraInitialized = true;
  }
  {
    // Fast lerp when grounded (tracks terrain), instant when falling/jumping
    const lerpRate = isGrounded ? 12 : 25;
    smoothCameraY += (playerPos.y - smoothCameraY) * Math.min(1, lerpRate * delta);
  }

  // ── Camera positioning ─────────────────────────────────────────────
  if (cameraMode === "first") {
    camera.position.set(
      playerPos.x + bobX * Math.cos(yaw),
      smoothCameraY + PLAYER_EYE_HEIGHT + bobY,
      playerPos.z + bobX * Math.sin(yaw)
    );
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    if (fpArms) {
      const sway = isWalking
        ? Math.sin(bobPhase * 2) * 0.012
        : Math.sin(performance.now() / 1000 * 0.8) * 0.004;
      fpArms.rotation.x = sway;
      fpArms.rotation.z = sway * 0.3;
    }
  } else {
    const camOffset = new THREE.Vector3(0, TP_OFFSET.y, TP_OFFSET.z);
    camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    camera.position.set(
      playerPos.x + camOffset.x,
      smoothCameraY + PLAYER_EYE_HEIGHT + camOffset.y,
      playerPos.z + camOffset.z
    );
    camera.lookAt(playerPos.x, smoothCameraY + PLAYER_HEIGHT * 0.8, playerPos.z);
  }

  // ── 16E: Update active power each frame ────────────────────────────
  updatePower(delta);
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

// ── 15A: Grounded spawn — world-space ground Y after centering ───────
let groundBaseY = 0;

function getGroundHeightAt(x: number, z: number): number {
  // 16E: Start from terrain noise height instead of flat ground
  const terrainY = groundBaseY + getTerrainNoiseY(x, z);
  let best = terrainY;
  const margin = 0.4;
  for (const box of collisionBoxes) {
    // Check if player is within horizontal bounds
    if (x > box.min.x - margin && x < box.max.x + margin &&
        z > box.min.z - margin && z < box.max.z + margin) {
      if (box.isCloud) {
        // Cloud platforms: walkable when above
        if (playerPos.y >= box.max.y - 0.5 && playerVelY <= 0) {
          best = Math.max(best, box.max.y);
        }
      } else {
        // Solid box: walkable surface if player is above its top face
        if (playerPos.y >= box.max.y - 0.3 && playerPos.y < box.max.y + 2 && playerVelY <= 0) {
          best = Math.max(best, box.max.y);
        }
      }
    }
  }
  return best;
}

/** @deprecated alias kept for internal callers */
function getGroundHeight(x: number, z: number): number {
  return getGroundHeightAt(x, z);
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

// ── 16C: Register physics bodies for movable world objects ───────────
function registerPhysicsBodies(): void {
  disposePhysics();
  if (!worldGroup) return;
  // Walk top-level children of worldGroup (entity groups)
  for (const child of worldGroup.children) {
    if (!child.userData.movable) continue;
    if (child.userData.interactionTag === "environment" || child.userData.interactionTag === "environment-cloud") continue;
    const mc = (child.userData.massClass as MassClass) || "medium";
    const shape = (child.userData.physicsShape as PhysicsShape) || "box";
    const body = createPhysicsBody(child, mc, shape);
    physicsBodies.push(body);
  }
}

// ── 16C: Register living entities for idle animation ─────────────────
function registerLivingEntities(): void {
  livingEntities.length = 0;
  if (!worldGroup) return;
  worldGroup.traverse((child: THREE.Object3D) => {
    if (child.userData.livingPresence) {
      livingEntities.push({
        group: child,
        kind: child.userData.livingPresence as string,
        basePos: child.position.clone(),
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: Math.random() * 3,
        idlePhase: Math.random() * Math.PI * 2,
        fleeTimer: 0,
        fleeAngle: 0,
        pauseTimer: 0,
        blinkTimer: 8 + Math.random() * 15,
      });
    }
  });
}

// ── 16C+16F: Animate living entities (idle sway, wander, flee, blink) ──
function updateLivingEntities(delta: number): void {
  const time = performance.now() / 1000;
  for (const le of livingEntities) {
    if (!le.group.visible) continue;
    le.wanderTimer -= delta;

    // 16F: Player proximity check for flee reaction
    const dx = le.group.position.x - playerPos.x;
    const dz = le.group.position.z - playerPos.z;
    const playerDist = Math.sqrt(dx * dx + dz * dz);

    if (le.kind === "humanoid") {
      // 16F: If player is very close, turn to face player
      if (playerDist < 6) {
        const toPlayer = Math.atan2(dz, dx) + Math.PI; // face toward player
        le.group.rotation.y += (toPlayer - le.group.rotation.y) * 0.04;
      } else {
        // Occasional slow turn + short wander step
        if (le.wanderTimer <= 0) {
          le.wanderAngle += (Math.random() - 0.5) * 1.5;
          le.wanderTimer = 2 + Math.random() * 4;
          le.pauseTimer = 0.8 + Math.random() * 1.5; // pause before next move
        }
        le.group.rotation.y += (le.wanderAngle - le.group.rotation.y) * 0.02;
      }
      // Subtle idle sway (breathing)
      le.group.rotation.z = Math.sin(time * 1.5 + le.idlePhase) * 0.03;
      // 16F: Small wander steps when not paused
      // 19G: Interior humanoids wander tighter and slower
      if (le.pauseTimer > 0) {
        le.pauseTimer -= delta;
      } else {
        const isIndoor = activeSceneType === "interior" || activeSceneType === "temple";
        const speed = (isIndoor ? 0.08 : 0.15) * delta;
        const maxWander = isIndoor ? 2 : 3;
        const nx = le.group.position.x + Math.cos(le.wanderAngle) * speed;
        const nz = le.group.position.z + Math.sin(le.wanderAngle) * speed;
        const dist = Math.sqrt((nx - le.basePos.x) ** 2 + (nz - le.basePos.z) ** 2);
        if (dist < maxWander) {
          le.group.position.x = nx;
          le.group.position.z = nz;
          le.group.position.y = getGroundHeightAt(nx, nz) - groundBaseY;
        } else {
          le.wanderAngle = Math.atan2(le.basePos.z - le.group.position.z, le.basePos.x - le.group.position.x);
        }
      }
      // 16F: Head/torso micro-turn — slight rotation.x oscillation
      if (le.group.children.length > 0) {
        le.group.children[0].rotation.x = Math.sin(time * 0.7 + le.idlePhase) * 0.04;
      }

    } else if (le.kind === "animal") {
      // 16F: Flee if player is very close
      if (le.fleeTimer > 0) {
        le.fleeTimer -= delta;
        const speed = 2.5 * delta;
        const nx = le.group.position.x + Math.cos(le.fleeAngle) * speed;
        const nz = le.group.position.z + Math.sin(le.fleeAngle) * speed;
        le.group.position.x = nx;
        le.group.position.z = nz;
        le.group.position.y = getGroundHeightAt(nx, nz) - groundBaseY;
        le.group.rotation.y = le.fleeAngle;
        // Bob faster during flee
        if (le.group.children.length > 0) {
          le.group.children[0].position.y = 0.4 + Math.abs(Math.sin(time * 8 + le.idlePhase)) * 0.06;
        }
      } else if (playerDist < 4.5) {
        // Start fleeing away from player
        le.fleeAngle = Math.atan2(dz, dx); // away from player
        le.fleeTimer = 1.5 + Math.random() * 1.0;
      } else {
        // Normal grazing wander
        if (le.wanderTimer <= 0) {
          le.wanderAngle += (Math.random() - 0.5) * 2;
          le.wanderTimer = 1.5 + Math.random() * 3;
          // 16F: Grazing pause — stop to "eat" occasionally
          if (Math.random() < 0.3) {
            le.pauseTimer = 1.0 + Math.random() * 2.0;
          }
        }
        if (le.pauseTimer > 0) {
          le.pauseTimer -= delta;
          // Grazing head bob
          if (le.group.children.length > 0) {
            le.group.children[0].position.y = 0.3 + Math.sin(time * 2 + le.idlePhase) * 0.03;
          }
        } else {
          const speed = 0.4 * delta;
          const nx = le.group.position.x + Math.cos(le.wanderAngle) * speed;
          const nz = le.group.position.z + Math.sin(le.wanderAngle) * speed;
          const dist = Math.sqrt((nx - le.basePos.x) ** 2 + (nz - le.basePos.z) ** 2);
          if (dist < 5) {
            le.group.position.x = nx;
            le.group.position.z = nz;
            le.group.position.y = getGroundHeightAt(nx, nz) - groundBaseY;
          } else {
            le.wanderAngle = Math.atan2(le.basePos.z - le.group.position.z, le.basePos.x - le.group.position.x);
          }
          le.group.rotation.y = le.wanderAngle;
          if (le.group.children.length > 0) {
            le.group.children[0].position.y = 0.4 + Math.sin(time * 3 + le.idlePhase) * 0.02;
          }
        }
      }

    } else if (le.kind === "creature") {
      // Hover and slowly orbit
      le.group.position.y = le.basePos.y + 0.5 + Math.sin(time * 0.8 + le.idlePhase) * 0.4;
      le.group.rotation.y += delta * 0.3;
      // Gentle lateral drift
      le.group.position.x = le.basePos.x + Math.sin(time * 0.3 + le.idlePhase) * 1.5;
      le.group.position.z = le.basePos.z + Math.cos(time * 0.25 + le.idlePhase * 1.3) * 1.5;
      // 16F: Pulse/breathe — subtle scale oscillation
      const s = 1.0 + Math.sin(time * 1.2 + le.idlePhase) * 0.05;
      le.group.scale.set(s, s, s);
      // 16F: Occasional blink/vanish for surreal creatures
      le.blinkTimer -= delta;
      if (le.blinkTimer <= 0) {
        le.group.visible = false;
        const blinkDur = 0.15 + Math.random() * 0.3;
        setTimeout(() => { le.group.visible = true; }, blinkDur * 1000);
        le.blinkTimer = 6 + Math.random() * 12;
      }
    } else if (le.kind === "turtle") {
      // 18C: Turtle — slow waddle, mostly stationary, grazing motion
      if (le.wanderTimer <= 0) {
        le.wanderAngle += (Math.random() - 0.5) * 1.2;
        le.wanderTimer = 4 + Math.random() * 8;
        if (Math.random() < 0.5) le.pauseTimer = 2 + Math.random() * 4;
      }
      if (le.pauseTimer > 0) {
        le.pauseTimer -= delta;
      } else {
        const speed = 0.12 * delta;
        const nx = le.group.position.x + Math.cos(le.wanderAngle) * speed;
        const nz = le.group.position.z + Math.sin(le.wanderAngle) * speed;
        const dist = Math.sqrt((nx - le.basePos.x) ** 2 + (nz - le.basePos.z) ** 2);
        if (dist < 4) {
          le.group.position.x = nx;
          le.group.position.z = nz;
        } else {
          le.wanderAngle = Math.atan2(le.basePos.z - le.group.position.z, le.basePos.x - le.group.position.x);
        }
        le.group.rotation.y = le.wanderAngle;
      }
      // Subtle head bob
      if (le.group.children.length > 0) {
        le.group.children[2].position.y = 0.22 + Math.sin(time * 0.8 + le.idlePhase) * 0.03;
      }
    }
  }
}

// ── 16F: Landmark event system — register & animate ─────────────────
const LANDMARK_EVENT_NAMES: Record<string, string[]> = {
  bell: ["bell"],
  temple: ["temple"],
  cave: ["cave"],
  lava: ["volcano", "lava"],
  arena: ["arena"],
  spire: ["spire"],
  ruin: ["ruin", "ruins"],
  shrine: ["shrine", "altar"],
};

function registerLandmarkEvents(): void {
  landmarkEvents.length = 0;
  bellSwingGroups.length = 0;
  if (!worldGroup) return;
  worldGroup.children.forEach((child: THREE.Object3D) => {
    const tag = child.userData.interactionTag as string | undefined;
    const name = (child.userData.entityName as string || "").toLowerCase();
    if (!tag || (tag !== "landmark" && tag !== "structure")) return;
    // Match against known landmark types
    for (const [eventType, names] of Object.entries(LANDMARK_EVENT_NAMES)) {
      if (names.some(n => name.includes(n))) {
        landmarkEvents.push({
          group: child,
          tag: eventType,
          timer: 5 + Math.random() * 10,
          interval: 8 + Math.random() * 12,
          lastEventTime: 0,
        });
        // Track bells for swing animation
        if (eventType === "bell") {
          bellSwingGroups.push({ group: child, baseRotZ: child.rotation.z, phase: Math.random() * Math.PI * 2, ringing: 0 });
        }
        break;
      }
    }
  });
}

function updateLandmarkEvents(dt: number): void {
  const time = performance.now() / 1000;
  for (const le of landmarkEvents) {
    if (!le.group.visible) continue;
    le.timer -= dt;
    if (le.timer > 0) continue;
    le.timer = le.interval + Math.random() * 6;
    le.lastEventTime = time;

    // Fire thematic event based on landmark type
    if (le.tag === "bell") {
      // Bell toll — glow pulse + ring swing
      const bellEntry = bellSwingGroups.find(b => b.group === le.group);
      if (bellEntry) bellEntry.ringing = 2.5; // 2.5 seconds of active ringing
      le.group.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          const m = child.material;
          const orig = m.emissiveIntensity;
          m.emissive.setHex(0xffdd66);
          m.emissiveIntensity = 0.8;
          setTimeout(() => { m.emissiveIntensity = orig; m.emissive.setHex(0x000000); }, 1500);
        }
      });
      // Play bell toll if player is within earshot
      const dx = le.group.position.x - playerPos.x;
      const dz = le.group.position.z - playerPos.z;
      if (dx * dx + dz * dz < 2500) playBellTollSound();

    } else if (le.tag === "temple") {
      // Temple — brief light beam from top (emissive flash on upper children)
      let count = 0;
      le.group.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.position.y > 2 && count < 3) {
          const m = child.material as THREE.MeshStandardMaterial;
          if (m.emissive) {
            const orig = m.emissiveIntensity;
            m.emissive.setHex(0xffeedd);
            m.emissiveIntensity = 1.2;
            setTimeout(() => { m.emissiveIntensity = orig; m.emissive.setHex(0x000000); }, 2000);
            count++;
          }
        }
      });

    } else if (le.tag === "cave") {
      // Cave — dust shimmer: brief emissive on lower surfaces
      le.group.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          const m = child.material;
          const orig = m.emissiveIntensity;
          m.emissive.setHex(0x776655);
          m.emissiveIntensity = 0.4;
          setTimeout(() => { m.emissiveIntensity = orig; m.emissive.setHex(0x000000); }, 800);
        }
      });

    } else if (le.tag === "lava") {
      // Lava bubbles — pulse orange glow
      le.group.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          const m = child.material;
          const orig = m.emissiveIntensity;
          m.emissive.setHex(0xff4400);
          m.emissiveIntensity = 1.5;
          setTimeout(() => { m.emissiveIntensity = orig; }, 1200);
        }
      });

    } else if (le.tag === "arena") {
      // Arena — center glow pulse
      le.group.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial && child.position.y < 1) {
          const m = child.material;
          const orig = m.emissiveIntensity;
          m.emissive.setHex(0x4488ff);
          m.emissiveIntensity = 0.6;
          setTimeout(() => { m.emissiveIntensity = orig; m.emissive.setHex(0x000000); }, 1800);
        }
      });

    } else if (le.tag === "spire") {
      // Spire — top crystal glow
      let topChild: THREE.Mesh | null = null;
      let maxY = -Infinity;
      le.group.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.position.y > maxY) {
          maxY = child.position.y;
          topChild = child;
        }
      });
      if (topChild) {
        const m = (topChild as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (m.emissive) {
          const orig = m.emissiveIntensity;
          m.emissive.setHex(0xaaddff);
          m.emissiveIntensity = 2.0;
          setTimeout(() => { m.emissiveIntensity = orig; m.emissive.setHex(0x000000); }, 2500);
        }
      }

    } else if (le.tag === "ruin") {
      // Ruin — shifting stones: small random position jitter on a child
      const children = le.group.children;
      if (children.length > 0) {
        const target = children[Math.floor(Math.random() * children.length)];
        const origX = target.position.x;
        const origZ = target.position.z;
        target.position.x += (Math.random() - 0.5) * 0.15;
        target.position.z += (Math.random() - 0.5) * 0.15;
        setTimeout(() => { target.position.x = origX; target.position.z = origZ; }, 2000);
      }

    } else if (le.tag === "shrine") {
      // Shrine — warm glow
      le.group.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          const m = child.material;
          const orig = m.emissiveIntensity;
          m.emissive.setHex(0xffaa44);
          m.emissiveIntensity = 0.7;
          setTimeout(() => { m.emissiveIntensity = orig; m.emissive.setHex(0x000000); }, 2000);
        }
      });
    }
  }

  // Animate bell swings
  for (const bell of bellSwingGroups) {
    if (bell.ringing > 0) {
      bell.ringing -= dt;
      bell.group.rotation.z = bell.baseRotZ + Math.sin(time * 6 + bell.phase) * 0.12 * Math.min(bell.ringing, 1);
    } else {
      // Gentle idle sway
      bell.group.rotation.z = bell.baseRotZ + Math.sin(time * 0.8 + bell.phase) * 0.02;
    }
  }
}

// ── 16A-C: Gamepad / controller support ──────────────────────────────
interface GamepadInput {
  moveX: number;  // left stick horizontal [-1, 1]
  moveY: number;  // left stick vertical [-1, 1]
  lookX: number;  // right stick horizontal [-1, 1]
  lookY: number;  // right stick vertical [-1, 1]
  jump: boolean;
  sprint: boolean;
  interact: boolean;
}
const STICK_DEADZONE = 0.15;
let gamepadConnected = false;
let lastGamepadJump = false; // edge detection for jump press
// 16B: Edge detection for gamepad power buttons
let lastGamepadDpadUp = false;
let lastGamepadDpadDown = false;
let lastGamepadRT = false;
const POWER_CYCLE: PowerType[] = ["none", "flight", "laser", "telekinesis", "destruction", "shockwave"];

function applyDeadzone(value: number): number {
  if (Math.abs(value) < STICK_DEADZONE) return 0;
  const sign = value > 0 ? 1 : -1;
  return sign * (Math.abs(value) - STICK_DEADZONE) / (1 - STICK_DEADZONE);
}

function pollGamepad(): GamepadInput | null {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp: Gamepad | null = null;
  for (const g of gamepads) {
    if (g && g.connected) { gp = g; break; }
  }
  if (!gp) {
    if (gamepadConnected) {
      gamepadConnected = false;
      updateGamepadHint(false);
    }
    return null;
  }
  if (!gamepadConnected) {
    gamepadConnected = true;
    updateGamepadHint(true);
  }

  const moveX = applyDeadzone(gp.axes[0] ?? 0);
  const moveY = applyDeadzone(gp.axes[1] ?? 0);
  const lookX = applyDeadzone(gp.axes[2] ?? 0);
  const lookY = applyDeadzone(gp.axes[3] ?? 0);

  // Standard mapping: A/Cross=0, B/Circle=1, LB/L1=4, RB/R1=5, Start=9
  const jumpRaw = gp.buttons[0]?.pressed ?? false;
  const jump = jumpRaw && !lastGamepadJump; // edge-triggered
  lastGamepadJump = jumpRaw;

  const sprint = gp.buttons[4]?.pressed || gp.buttons[5]?.pressed || false;
  const interact = gp.buttons[1]?.pressed ?? false;

  // Handle gamepad interaction trigger
  if (interact) triggerInteraction();

  // 16B: D-pad power cycling (Up=12, Down=13)
  const dpadUp = gp.buttons[12]?.pressed ?? false;
  const dpadDown = gp.buttons[13]?.pressed ?? false;
  if (dpadUp && !lastGamepadDpadUp) {
    const idx = POWER_CYCLE.indexOf(currentPower);
    const next = (idx + 1) % POWER_CYCLE.length;
    activatePower(POWER_CYCLE[next]);
  }
  if (dpadDown && !lastGamepadDpadDown) {
    const idx = POWER_CYCLE.indexOf(currentPower);
    const prev = (idx - 1 + POWER_CYCLE.length) % POWER_CYCLE.length;
    activatePower(POWER_CYCLE[prev]);
  }
  lastGamepadDpadUp = dpadUp;
  lastGamepadDpadDown = dpadDown;

  // 16E: Right trigger (RT=7) — hold-to-fire for laser, hold-to-grab for telekinesis
  const rtPressed = gp.buttons[7]?.pressed ?? false;
  if (rtPressed && !lastGamepadRT) {
    powerUsePressed = true;
    if (currentPower === "laser") {
      startLaserFiring();
    } else if (currentPower === "telekinesis" && !telekinesisTarget) {
      grabTelekinesisTarget();
    } else {
      usePower();
    }
  }
  if (!rtPressed && lastGamepadRT) {
    powerUsePressed = false;
    if (currentPower === "laser" && laserFiring) stopLaserFiring();
    else if (currentPower === "telekinesis" && telekinesisTarget) dropTelekinesisTarget();
  }
  lastGamepadRT = rtPressed;

  return { moveX, moveY, lookX, lookY, jump, sprint, interact };
}

function updateGamepadHint(connected: boolean): void {
  const el = document.getElementById("gamepad-hint");
  if (el) {
    el.textContent = connected ? "🎮 Connected — D-pad: powers | RT: use | A: jump | B: interact" : "";
    el.style.opacity = connected ? "1" : "0";
    if (connected) setTimeout(() => { el.style.opacity = "0"; }, 4000);
  }
}

// ── 16E-F: Power framework ──────────────────────────────────────────
type PowerType = "none" | "flight" | "laser" | "telekinesis" | "destruction" | "shockwave";
let currentPower: PowerType = "flight";
let flightActive = true;
let laserBeam: THREE.Line | null = null;
// 16B: Power state
let laserCooldown = 0;
let telekinesisTarget: THREE.Object3D | null = null;
let telekinesisOriginalPos: THREE.Vector3 | null = null;
let telekinesisHoldDist = 6;
let destructionCooldown = 0;
let shockwaveCooldown = 0;
let powerUsePressed = false;
// 16D: Visual beam / tether / hit effects
let laserBeamMesh: THREE.Mesh | null = null;
let laserGlowMesh: THREE.Mesh | null = null;
let laserHitFlash: THREE.Mesh | null = null;
let laserHitTimer = 0;
let telekinesisTether: THREE.Line | null = null;
const activeSparkParticles: { mesh: THREE.Points; birth: number }[] = [];
// 16E: Sustained laser state
let laserFiring = false;
let laserDamageAccum = 0; // accumulated damage ticks on current target
let laserLastHitRoot: THREE.Object3D | null = null;
let laserSparkTimer = 0;

function activatePower(power: PowerType): void {
  // Deactivate current
  if (currentPower === "flight" && flightActive) {
    flightActive = false;
  }
  if (currentPower === "laser") {
    // Clean up all laser visuals
    stopLaserFiring();
    if (laserBeam) { laserBeam.parent?.remove(laserBeam); laserBeam.geometry.dispose(); (laserBeam.material as THREE.Material).dispose(); laserBeam = null; }
    if (laserBeamMesh) { laserBeamMesh.parent?.remove(laserBeamMesh); laserBeamMesh.geometry.dispose(); (laserBeamMesh.material as THREE.Material).dispose(); laserBeamMesh = null; }
    if (laserGlowMesh) { laserGlowMesh.parent?.remove(laserGlowMesh); laserGlowMesh.geometry.dispose(); (laserGlowMesh.material as THREE.Material).dispose(); laserGlowMesh = null; }
    if (laserHitFlash) { laserHitFlash.parent?.remove(laserHitFlash); laserHitFlash.geometry.dispose(); (laserHitFlash.material as THREE.Material).dispose(); laserHitFlash = null; }
  }
  // Drop telekinesis target + tether
  if (currentPower === "telekinesis" && telekinesisTarget) {
    dropTelekinesisTarget();
  }
  if (telekinesisTether) {
    telekinesisTether.parent?.remove(telekinesisTether); telekinesisTether.geometry.dispose();
    (telekinesisTether.material as THREE.Material).dispose(); telekinesisTether = null;
  }
  currentPower = power;
  // Auto-activate flight when selected
  if (power === "flight") flightActive = true;
  laserCooldown = 0;
  destructionCooldown = 0;
  shockwaveCooldown = 0;
  updatePowerUI();
}

function updatePower(delta: number): void {
  // Tick cooldowns
  if (laserCooldown > 0) laserCooldown -= delta;
  if (destructionCooldown > 0) destructionCooldown -= delta;
  if (shockwaveCooldown > 0) shockwaveCooldown -= delta;

  // 16D: Update laser hit flash timer
  if (laserHitFlash && laserHitTimer > 0) {
    laserHitTimer -= delta;
    if (laserHitTimer <= 0) {
      laserHitFlash.parent?.remove(laserHitFlash);
      laserHitFlash.geometry.dispose();
      (laserHitFlash.material as THREE.Material).dispose();
      laserHitFlash = null;
    } else {
      const s = 0.3 + (laserHitTimer / 0.15) * 0.7;
      laserHitFlash.scale.set(s, s, s);
      (laserHitFlash.material as THREE.MeshBasicMaterial).opacity = laserHitTimer / 0.15;
    }
  }

  // 16D: Update spark particles
  const now = performance.now();
  for (let i = activeSparkParticles.length - 1; i >= 0; i--) {
    const sp = activeSparkParticles[i];
    if (now - sp.birth > 400) {
      sp.mesh.parent?.remove(sp.mesh);
      sp.mesh.geometry.dispose();
      (sp.mesh.material as THREE.Material).dispose();
      activeSparkParticles.splice(i, 1);
    }
  }

  // Laser sight rendering (always visible when selected) / sustained beam
  if (currentPower === "laser" && camera && scene) {
    if (laserFiring) {
      updateLaserBeam(delta);
    } else {
      updateLaserSight();
    }
  }
  // Telekinesis: keep held object in front of camera
  if (currentPower === "telekinesis" && telekinesisTarget && camera) {
    updateTelekinesisHold();
  }
}

// 16E: Fire/use the current power (laser & telekinesis handled via start/stop, not here)
function usePower(): void {
  if (!camera || !scene || !worldGroup) return;

  if (currentPower === "destruction" && destructionCooldown <= 0) {
    fireDestruction();
    destructionCooldown = 0.5;
  } else if (currentPower === "shockwave" && shockwaveCooldown <= 0) {
    fireShockwave();
    shockwaveCooldown = 0.8;
  }
}

// 16E: Start / stop sustained laser firing
function startLaserFiring(): void {
  if (laserFiring) return;
  laserFiring = true;
  laserDamageAccum = 0;
  laserLastHitRoot = null;
  laserSparkTimer = 0;
  playLaserFireSound();
  startLaserLoop();
}

function stopLaserFiring(): void {
  if (!laserFiring) return;
  laserFiring = false;
  laserDamageAccum = 0;
  laserLastHitRoot = null;
  stopLaserLoop();
  // Remove beam visuals
  if (laserBeamMesh) { laserBeamMesh.parent?.remove(laserBeamMesh); laserBeamMesh.geometry.dispose(); (laserBeamMesh.material as THREE.Material).dispose(); laserBeamMesh = null; }
  if (laserGlowMesh) { laserGlowMesh.parent?.remove(laserGlowMesh); laserGlowMesh.geometry.dispose(); (laserGlowMesh.material as THREE.Material).dispose(); laserGlowMesh = null; }
  if (laserHitFlash) { laserHitFlash.parent?.remove(laserHitFlash); laserHitFlash.geometry.dispose(); (laserHitFlash.material as THREE.Material).dispose(); laserHitFlash = null; }
}

// 16E-A: Sustained laser beam — runs every frame while holding fire
function updateLaserBeam(delta: number): void {
  if (!camera || !worldGroup || !scene) return;
  const origin = camera.position.clone();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  raycaster.set(origin, dir);
  raycaster.far = 60;
  const hits = raycaster.intersectObjects(worldGroup.children, true);

  let hitPoint = origin.clone().addScaledVector(dir, 60);
  let didHitObject = false;

  for (const hit of hits) {
    const tag = hit.object.userData.interactionTag as string | undefined;
    if (!tag || tag === "environment" || tag === "ground" || tag === "terrain") continue;
    hitPoint = hit.point.clone();
    didHitObject = true;

    const root = findLandmarkRoot(hit.object);
    root.userData.lastHitTime = performance.now();
    root.userData.lastHitPoint = hit.point.clone();
    root.userData.lastHitNormal = hit.face ? hit.face.normal.clone() : dir.clone().negate();

    // Flash hit mesh (continuous subtle glow)
    const mesh = hit.object as THREE.Mesh;
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.emissive.setHex(0xff4400);
      mesh.material.emissiveIntensity = 1.5 + Math.sin(performance.now() * 0.02) * 0.5;
    }

    // Continuous physics force on movable objects
    const body = findPhysicsBody(hit.object);
    if (body) {
      applyImpulse(body, dir.clone().multiplyScalar(3 * delta));
    }

    // Damage accumulation on destructibles
    if (root.userData.destructible) {
      if (laserLastHitRoot !== root) {
        laserLastHitRoot = root;
        laserDamageAccum = 0;
      }
      laserDamageAccum += delta * 2.5; // ~2.5 damage per second
      const threshold = root.userData.massClass === "heavy" ? 5 : root.userData.massClass === "medium" ? 3 : 2;
      // Check for damage state transitions
      const damageRatio = laserDamageAccum / threshold;
      if (damageRatio >= 1.0) {
        // Fully destroyed
        spawnDebris(root.position.clone(), dir, 6, root);
        root.visible = false;
        playDestructionSound();
        laserDamageAccum = 0;
        laserLastHitRoot = null;
      } else if (damageRatio >= 0.5) {
        // Damaged state: darken + shrink
        root.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.color.lerp(new THREE.Color(0x222222), 0.003);
            child.material.emissive.setHex(0x441100);
            child.material.emissiveIntensity = 0.3 + Math.sin(performance.now() * 0.01) * 0.15;
          }
        });
        const s = root.scale.x * (1 - 0.02 * delta);
        root.scale.set(Math.max(s, 0.7), Math.max(s, 0.7), Math.max(s, 0.7));
      }
    }

    // Living entity reactions (continuous — only trigger once per entity)
    if (root.userData.livingPresence && !root.userData._laserReacted) {
      root.userData._laserReacted = true;
      reactLivingEntity(root, dir);
    }

    // 16F: Reactive world events — bell ring on laser hit
    const entityName = (root.userData.entityName as string || "").toLowerCase();
    if (entityName.includes("bell") && !root.userData._bellRangThisFrame) {
      root.userData._bellRangThisFrame = true;
      const bellEntry = bellSwingGroups.find(b => b.group === root);
      if (bellEntry) bellEntry.ringing = Math.max(bellEntry.ringing, 3.0);
      playBellTollSound();
      setTimeout(() => { root.userData._bellRangThisFrame = false; }, 2000);
    }
    // 16F: Dust burst on cave/ruin laser hit
    if ((entityName.includes("cave") || entityName.includes("ruin")) && !root.userData._dustBurstThisFrame) {
      root.userData._dustBurstThisFrame = true;
      spawnDustBurst(hit.point);
      setTimeout(() => { root.userData._dustBurstThisFrame = false; }, 800);
    }

    // Periodic sparks at hit point
    laserSparkTimer -= delta;
    if (laserSparkTimer <= 0) {
      laserSparkTimer = 0.15;
      spawnSparks(hitPoint, dir.clone().negate(), 4);
      playLaserHitSound();
    }
    break;
  }

  // Update / create beam visuals from camera to hit
  const beamLen = origin.distanceTo(hitPoint);
  const beamMid = origin.clone().add(hitPoint).multiplyScalar(0.5);
  const beamDir = hitPoint.clone().sub(origin).normalize();
  const beamQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir);

  // 18D: Core beam — thicker, brighter, more impactful
  if (laserBeamMesh) {
    laserBeamMesh.geometry.dispose();
    laserBeamMesh.geometry = new THREE.CylinderGeometry(0.07, 0.07, beamLen, 8, 1);
    laserBeamMesh.position.copy(beamMid);
    laserBeamMesh.quaternion.copy(beamQuat);
    (laserBeamMesh.material as THREE.MeshBasicMaterial).opacity = 0.97 + Math.sin(performance.now() * 0.03) * 0.03;
  } else {
    const coreGeo = new THREE.CylinderGeometry(0.07, 0.07, beamLen, 8, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff1010, transparent: true, opacity: 0.97 });
    laserBeamMesh = new THREE.Mesh(coreGeo, coreMat);
    laserBeamMesh.position.copy(beamMid);
    laserBeamMesh.quaternion.copy(beamQuat);
    scene.add(laserBeamMesh);
  }

  // 18D: Wide glow shell + outer haze (reuse or create)
  if (laserGlowMesh) {
    laserGlowMesh.geometry.dispose();
    laserGlowMesh.geometry = new THREE.CylinderGeometry(0.26, 0.26, beamLen, 8, 1);
    laserGlowMesh.position.copy(beamMid);
    laserGlowMesh.quaternion.copy(beamQuat);
    (laserGlowMesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(performance.now() * 0.025) * 0.12;
  } else {
    const glowGeo = new THREE.CylinderGeometry(0.26, 0.26, beamLen, 8, 1);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff5522, transparent: true, opacity: 0.38, depthWrite: false });
    laserGlowMesh = new THREE.Mesh(glowGeo, glowMat);
    laserGlowMesh.position.copy(beamMid);
    laserGlowMesh.quaternion.copy(beamQuat);
    scene.add(laserGlowMesh);
  }

  // 18D: Hit flash sphere — larger and brighter for readability
  // Hit flash sphere at impact (update position each frame)
  if (didHitObject) {
    if (laserHitFlash) {
      laserHitFlash.position.copy(hitPoint);
      const s = 0.45 + Math.sin(performance.now() * 0.04) * 0.18;
      laserHitFlash.scale.set(s, s, s);
      (laserHitFlash.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(performance.now() * 0.03) * 0.2;
    } else {
      const flashGeo = new THREE.SphereGeometry(0.55, 10, 10);
      const flashMat = new THREE.MeshBasicMaterial({ color: 0xffcc22, transparent: true, opacity: 0.8, depthWrite: false });
      laserHitFlash = new THREE.Mesh(flashGeo, flashMat);
      laserHitFlash.position.copy(hitPoint);
      scene.add(laserHitFlash);
    }
    laserHitTimer = 0.15;
  } else {
    // No hit — remove flash
    if (laserHitFlash) {
      laserHitFlash.parent?.remove(laserHitFlash);
      laserHitFlash.geometry.dispose();
      (laserHitFlash.material as THREE.Material).dispose();
      laserHitFlash = null;
    }
  }

  // Also update the laser sight line to match beam
  if (laserBeam) {
    const positions = laserBeam.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, origin.x, origin.y, origin.z);
    positions.setXYZ(1, hitPoint.x, hitPoint.y, hitPoint.z);
    positions.needsUpdate = true;
    (laserBeam.material as THREE.LineBasicMaterial).opacity = 0.5;
  }
}

// 16D: Telekinesis — grab with tether line + spring + sounds
let telekinesisBody: PhysicsBody | null = null;

function grabTelekinesisTarget(): void {
  if (!camera || !worldGroup || !scene) return;
  const origin = camera.position.clone();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  raycaster.set(origin, dir);
  raycaster.far = 30;
  const hits = raycaster.intersectObjects(worldGroup.children, true);
  for (const hit of hits) {
    const root = findLandmarkRoot(hit.object);
    if (root.userData.movable) {
      telekinesisTarget = root;
      telekinesisOriginalPos = root.position.clone();
      telekinesisHoldDist = Math.min(Math.max(origin.distanceTo(hit.point), 4), 10);
      telekinesisBody = findPhysicsBody(hit.object);
      if (telekinesisBody) telekinesisBody.frozen = false;
      // Visual feedback: bright purple glow
      root.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.setHex(0x8844ff);
          child.material.emissiveIntensity = 0.9;
        }
      });
      // 16D: Create tether line from player to object
      const tetherGeo = new THREE.BufferGeometry().setFromPoints([origin, root.position]);
      const tetherMat = new THREE.LineBasicMaterial({ color: 0xaa66ff, transparent: true, opacity: 0.75 });
      telekinesisTether = new THREE.Line(tetherGeo, tetherMat);
      scene.add(telekinesisTether);
      // 18: Orbiting aura ring around grabbed object
      const auraGeo = new THREE.TorusGeometry(1.2, 0.06, 8, 32);
      const auraMat = new THREE.MeshBasicMaterial({ color: 0xaa44ff, transparent: true, opacity: 0.55, depthWrite: false });
      const auraRing = new THREE.Mesh(auraGeo, auraMat);
      auraRing.userData.tkAura = true;
      root.add(auraRing);
      // second ring at 90°
      const auraGeo2 = new THREE.TorusGeometry(1.4, 0.04, 8, 32);
      const auraMat2 = new THREE.MeshBasicMaterial({ color: 0x6622ff, transparent: true, opacity: 0.35, depthWrite: false });
      const auraRing2 = new THREE.Mesh(auraGeo2, auraMat2);
      auraRing2.rotation.x = Math.PI / 2;
      auraRing2.userData.tkAura = true;
      root.add(auraRing2);
      playTelekinesisGrabSound();
      showFeedback("Grabbed! Release to throw.");
      break;
    }
  }
}

function updateTelekinesisHold(): void {
  if (!telekinesisTarget || !camera) return;
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const targetPos = camera.position.clone().addScaledVector(dir, telekinesisHoldDist);

  if (telekinesisBody) {
    // 16E: Stronger spring hold — mass-aware stiffness + damping
    const diff = targetPos.clone().sub(telekinesisTarget.position);
    const dist = diff.length();
    const stiffness = 18; // strong pull
    const damping = 0.45;
    const springForce = diff.normalize().multiplyScalar(stiffness * Math.min(dist, 8));
    telekinesisBody.velocity.lerp(springForce, damping);
    telekinesisBody.velocity.y += PHYSICS_GRAVITY * PHYSICS_FIXED_DT * 1.2; // stronger gravity counter
    telekinesisBody.frozen = false;
    // Track velocity for throw strength
    telekinesisTarget.userData._tkVelocity = telekinesisBody.velocity.clone();
  } else {
    telekinesisTarget.position.lerp(targetPos, 0.18);
  }
  // 16E: Gentle spin (slower, more controlled)
  telekinesisTarget.rotation.y += 0.018;
  // 18: Animate aura rings
  telekinesisTarget.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh && child.userData.tkAura) {
      child.rotation.y += 0.04;
      child.rotation.z += 0.025;
      const pulse = 0.45 + Math.sin(performance.now() * 0.006) * 0.15;
      if (child.material instanceof THREE.MeshBasicMaterial) child.material.opacity = pulse;
    }
  });

  // 16D: Update tether line
  if (telekinesisTether) {
    const positions = telekinesisTether.geometry.attributes.position as THREE.BufferAttribute;
    const camPos = camera.position;
    positions.setXYZ(0, camPos.x, camPos.y - 0.3, camPos.z);
    positions.setXYZ(1, telekinesisTarget.position.x, telekinesisTarget.position.y, telekinesisTarget.position.z);
    positions.needsUpdate = true;
    // Pulse opacity + distance-based brightness
    const normDist = Math.min(telekinesisHoldDist / 18, 1);
    (telekinesisTether.material as THREE.LineBasicMaterial).opacity = (0.5 + Math.sin(performance.now() * 0.01) * 0.2) * (1 - normDist * 0.4);
  }
}

function dropTelekinesisTarget(): void {
  if (!telekinesisTarget) return;
  // 16E: Throw strength based on held velocity + forward impulse
  if (telekinesisBody && camera) {
    const throwDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    // Use tracked velocity magnitude to scale throw
    const heldVel = telekinesisTarget.userData._tkVelocity as THREE.Vector3 | undefined;
    const velMag = heldVel ? heldVel.length() : 0;
    const throwStrength = Math.max(18, Math.min(velMag * 1.5, 40));
    applyImpulse(telekinesisBody, throwDir.multiplyScalar(throwStrength));
    applyImpulse(telekinesisBody, new THREE.Vector3(0, 5, 0));
    telekinesisBody = null;
  }
  playTelekinesisThrowSound();
  // Remove glow
  telekinesisTarget.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
      child.material.emissive.setHex(0x000000);
      child.material.emissiveIntensity = 0;
    }
    // 18: Remove orbiting aura rings
    if (child instanceof THREE.Mesh && child.userData.tkAura) {
      child.parent?.remove(child);
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
    }
  });
  // Cleanup tracked data
  delete telekinesisTarget.userData._tkVelocity;
  // 16D: Remove tether
  if (telekinesisTether) {
    telekinesisTether.parent?.remove(telekinesisTether);
    telekinesisTether.geometry.dispose();
    (telekinesisTether.material as THREE.Material).dispose();
    telekinesisTether = null;
  }
  telekinesisTarget = null;
  telekinesisOriginalPos = null;
}

// 16E-C: Destruction — damage state progression (intact → damaged → broken)
function fireDestruction(): void {
  if (!camera || !worldGroup || !scene) return;
  const origin = camera.position.clone();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  raycaster.set(origin, dir);
  raycaster.far = 25;
  const hits = raycaster.intersectObjects(worldGroup.children, true);
  for (const hit of hits) {
    const tag = hit.object.userData.interactionTag as string | undefined;
    if (!tag || tag === "environment" || tag === "ground" || tag === "terrain") continue;
    const root = findLandmarkRoot(hit.object);
    if (!root.userData.destructible) continue;
    // Store hit metadata
    root.userData.lastHitTime = performance.now();
    root.userData.lastHitPoint = hit.point.clone();
    root.userData.lastHitNormal = hit.face ? hit.face.normal.clone() : dir.clone().negate();

    // Accumulate destruction damage
    root.userData.destructDamage = (root.userData.destructDamage || 0) + 1;
    const threshold = root.userData.massClass === "heavy" ? 3 : root.userData.massClass === "medium" ? 2 : 1;
    const damageRatio = root.userData.destructDamage / threshold;

    if (damageRatio >= 1.0) {
      // BROKEN — full destruction
      playDestructionSound();
      // Burst flash — bright orange on all children
      root.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.setHex(0xff6600);
          child.material.emissiveIntensity = 3.5;
        }
      });
      // Physics impulse
      const body = findPhysicsBody(hit.object);
      if (body) {
        applyImpulse(body, dir.clone().multiplyScalar(25));
        applyImpulse(body, new THREE.Vector3(0, 10, 0));
      }
      spawnDebris(root.position.clone(), dir, 8, root);
      if (root.userData.livingPresence) {
        reactLivingEntity(root, dir);
      } else {
        setTimeout(() => { root.visible = false; }, 300);
      }
      spawnSparks(hit.point, dir.clone().negate(), 12);
      showFeedback("Destroyed!");
    } else {
      // DAMAGED — visual degradation but not broken yet
      playDestructionSound();
      // Darken + crack glow + shake
      root.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.color.lerp(new THREE.Color(0x333333), 0.25);
          child.material.emissive.setHex(0xff4400);
          child.material.emissiveIntensity = 2.0;
        }
      });
      // Shrink slightly
      const s = root.scale.x * 0.93;
      root.scale.set(s, s, s);
      // Shake animation
      const origPos = root.position.clone();
      const shakeStart = performance.now();
      const animateShake = () => {
        const elapsed = (performance.now() - shakeStart) / 1000;
        if (elapsed > 0.3) {
          root.position.copy(origPos);
          // Fade emissive to cracked glow
          root.traverse((child: THREE.Object3D) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
              child.material.emissive.setHex(0x441100);
              child.material.emissiveIntensity = 0.4;
            }
          });
          return;
        }
        const intensity = (1 - elapsed / 0.3) * 0.15;
        root.position.set(
          origPos.x + (Math.random() - 0.5) * intensity,
          origPos.y + (Math.random() - 0.5) * intensity * 0.5,
          origPos.z + (Math.random() - 0.5) * intensity
        );
        requestAnimationFrame(animateShake);
      };
      requestAnimationFrame(animateShake);
      // Small debris + sparks for damage stage
      spawnDebris(root.position.clone(), dir, 3, root);
      spawnSparks(hit.point, dir.clone().negate(), 6);
      // Physics push (lighter)
      const body = findPhysicsBody(hit.object);
      if (body) {
        applyImpulse(body, dir.clone().multiplyScalar(8));
      }
      showFeedback("Damaged!");
    }
    // 16F: Reactive world events on destruction hit
    const entityName = (root.userData.entityName as string || "").toLowerCase();
    if (entityName.includes("bell")) {
      const bellEntry = bellSwingGroups.find(b => b.group === root);
      if (bellEntry) bellEntry.ringing = Math.max(bellEntry.ringing, 3.0);
      playBellTollSound();
    }
    if (entityName.includes("cave") || entityName.includes("ruin")) {
      spawnDustBurst(hit.point);
    }
    break;
  }
}

// ── 16D: Helper — spawn debris pieces that fly out and fade ──────────
function spawnDebris(pos: THREE.Vector3, hitDir: THREE.Vector3, count: number, source: THREE.Object3D): void {
  if (!scene) return;
  // Get a color from the source if possible
  let debrisColor = 0x888888;
  source.traverse((c: THREE.Object3D) => {
    if (c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial) {
      debrisColor = c.material.color.getHex();
    }
  });
  const mat = new THREE.MeshStandardMaterial({ color: debrisColor, roughness: 0.9 });
  for (let i = 0; i < count; i++) {
    const size = 0.1 + Math.random() * 0.25;
    const geo = Math.random() > 0.5
      ? new THREE.BoxGeometry(size, size, size)
      : new THREE.TetrahedronGeometry(size, 0);
    const piece = new THREE.Mesh(geo, mat);
    piece.position.copy(pos);
    piece.position.y += 0.5;
    piece.castShadow = true;
    scene.add(piece);
    // Launch outward
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5);
    const speed = 3 + Math.random() * 5;
    const vx = Math.cos(angle) * speed + hitDir.x * 2;
    const vy = 3 + Math.random() * 4;
    const vz = Math.sin(angle) * speed + hitDir.z * 2;
    const spinX = (Math.random() - 0.5) * 8;
    const spinY = (Math.random() - 0.5) * 8;
    const startTime = performance.now();
    const animateDebris = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed > 2) {
        scene?.remove(piece);
        geo.dispose();
        return;
      }
      piece.position.x += vx * 0.016;
      piece.position.y += (vy - 15 * elapsed) * 0.016; // gravity
      piece.position.z += vz * 0.016;
      piece.rotation.x += spinX * 0.016;
      piece.rotation.y += spinY * 0.016;
      // Fade via scale
      if (elapsed > 1.2) {
        const fade = 1 - (elapsed - 1.2) / 0.8;
        piece.scale.setScalar(Math.max(fade, 0));
      }
      requestAnimationFrame(animateDebris);
    };
    requestAnimationFrame(animateDebris);
  }
}

// ── 16D: Helper — spawn spark particles at a point ───────────────────
// 16F: Dust burst VFX for cave/ruin impacts
function spawnDustBurst(pos: THREE.Vector3): void {
  if (!scene) return;
  playDustBurstSound();
  const count = 12;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.3;
    positions[i * 3 + 1] = pos.y + Math.random() * 0.2;
    positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0x998877, size: 0.2, transparent: true, opacity: 0.7, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  const velocities: number[] = [];
  for (let i = 0; i < count; i++) {
    velocities.push((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
  }
  const startTime = performance.now();
  const animateDust = () => {
    const elapsed = (performance.now() - startTime) / 1000;
    if (elapsed > 0.6) { scene.remove(points); geo.dispose(); mat.dispose(); return; }
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      posAttr.setX(i, posAttr.getX(i) + velocities[i * 3] * 0.016);
      posAttr.setY(i, posAttr.getY(i) + velocities[i * 3 + 1] * 0.016);
      posAttr.setZ(i, posAttr.getZ(i) + velocities[i * 3 + 2] * 0.016);
    }
    posAttr.needsUpdate = true;
    mat.opacity = 0.7 * (1 - elapsed / 0.6);
    requestAnimationFrame(animateDust);
  };
  requestAnimationFrame(animateDust);
}

function spawnSparks(pos: THREE.Vector3, normal: THREE.Vector3, count: number): void {
  if (!scene) return;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x + (Math.random() - 0.5) * 0.1;
    positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.1;
    positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffcc44, size: 0.12, transparent: true, opacity: 1, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  activeSparkParticles.push({ mesh: points, birth: performance.now() });

  // Animate sparks outward
  const velocities: number[] = [];
  for (let i = 0; i < count; i++) {
    velocities.push(
      normal.x * 2 + (Math.random() - 0.5) * 4,
      normal.y * 2 + Math.random() * 3,
      normal.z * 2 + (Math.random() - 0.5) * 4
    );
  }
  const startTime = performance.now();
  const animateSparks = () => {
    const elapsed = (performance.now() - startTime) / 1000;
    if (elapsed > 0.4) return;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      posAttr.setX(i, posAttr.getX(i) + velocities[i * 3] * 0.016);
      posAttr.setY(i, posAttr.getY(i) + (velocities[i * 3 + 1] - 10 * elapsed) * 0.016);
      posAttr.setZ(i, posAttr.getZ(i) + velocities[i * 3 + 2] * 0.016);
    }
    posAttr.needsUpdate = true;
    mat.opacity = 1 - elapsed / 0.4;
    requestAnimationFrame(animateSparks);
  };
  requestAnimationFrame(animateSparks);
}

// ── 16D-G: Living entity reactions — recoil + flash + flee ───────────
function reactLivingEntity(entity: THREE.Object3D, forceDir: THREE.Vector3): void {
  // Flash white
  entity.traverse((child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
      const m = child.material;
      const origColor = m.color.clone();
      const origEmissive = m.emissive.clone();
      m.emissive.setHex(0xffffff);
      m.emissiveIntensity = 2.0;
      setTimeout(() => {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.emissive.copy(origEmissive);
          m.emissiveIntensity = 0;
        }
      }, 200);
    }
  });
  // Recoil: push away from force direction
  const recoilDir = forceDir.clone().setY(0).normalize();
  const startPos = entity.position.clone();
  const targetPos = startPos.clone().addScaledVector(recoilDir, 4);
  const startTime = performance.now();
  const animateRecoil = () => {
    const elapsed = (performance.now() - startTime) / 1000;
    if (elapsed > 0.6) {
      // After recoil, fade out and vanish
      const fadeStart = performance.now();
      const animateFade = () => {
        const fadeElapsed = (performance.now() - fadeStart) / 1000;
        if (fadeElapsed > 0.8) {
          entity.visible = false;
          return;
        }
        entity.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.opacity = 1 - fadeElapsed / 0.8;
            child.material.transparent = true;
          }
        });
        requestAnimationFrame(animateFade);
      };
      requestAnimationFrame(animateFade);
      return;
    }
    const t = elapsed / 0.6;
    const ease = t * (2 - t); // ease-out
    entity.position.lerpVectors(startPos, targetPos, ease);
    requestAnimationFrame(animateRecoil);
  };
  requestAnimationFrame(animateRecoil);
}

// ── 16D-F: Shockwave / force push ───────────────────────────────────
function fireShockwave(): void {
  if (!camera || !worldGroup || !scene) return;
  playShockwaveSound();
  const origin = camera.position.clone();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const pushOrigin = origin.clone().addScaledVector(forward, 2);
  const SHOCKWAVE_RADIUS = 12;
  const SHOCKWAVE_FORCE = 18;

  // Visual: expanding ring (18D: brighter + double ring)
  const ringGeo = new THREE.TorusGeometry(0.5, 0.2, 8, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pushOrigin);
  ring.lookAt(pushOrigin.clone().add(forward));
  scene.add(ring);
  // 18D: Secondary inner flash ring
  const ring2Geo = new THREE.TorusGeometry(0.3, 0.3, 6, 24);
  const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
  ring2.position.copy(pushOrigin);
  ring2.lookAt(pushOrigin.clone().add(forward));
  scene.add(ring2);
  // 18: Ground shockwave disc — horizontal ring expanding outward
  const groundRingGeo = new THREE.TorusGeometry(0.5, 0.25, 6, 48);
  const groundRingMat = new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.55, depthWrite: false });
  const groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.set(pushOrigin.x, 0.15, pushOrigin.z);
  scene.add(groundRing);
  // 18: Spawn debris burst particles from origin
  spawnDustBurst(pushOrigin);
  const ringStart = performance.now();
  const animateRing = () => {
    const elapsed = (performance.now() - ringStart) / 1000;
    if (elapsed > 0.6) {
      scene?.remove(ring); scene?.remove(ring2); scene?.remove(groundRing);
      ringGeo.dispose(); ringMat.dispose();
      ring2Geo.dispose(); ring2Mat.dispose();
      groundRingGeo.dispose(); groundRingMat.dispose();
      return;
    }
    const s = 1 + elapsed * 32;
    ring.scale.set(s, s, s);
    ringMat.opacity = 0.9 * (1 - elapsed / 0.6);
    const s2 = 1 + elapsed * 50;
    ring2.scale.set(s2, s2, s2);
    ring2Mat.opacity = 0.6 * Math.max(0, 1 - elapsed / 0.28);
    const sg = 1 + elapsed * SHOCKWAVE_RADIUS * 1.8;
    groundRing.scale.set(sg, sg, sg);
    groundRingMat.opacity = 0.55 * (1 - elapsed / 0.6);
    requestAnimationFrame(animateRing);
  };
  requestAnimationFrame(animateRing);

  // Apply impulse to all nearby physics bodies
  let hitCount = 0;
  for (const body of physicsBodies) {
    const dist = body.mesh.position.distanceTo(pushOrigin);
    if (dist > SHOCKWAVE_RADIUS || dist < 0.5) continue;
    const falloff = 1 - dist / SHOCKWAVE_RADIUS;
    const pushDir = body.mesh.position.clone().sub(pushOrigin).normalize();
    pushDir.y = Math.max(pushDir.y, 0.3); // some upward component
    applyImpulse(body, pushDir.multiplyScalar(SHOCKWAVE_FORCE * falloff));
    hitCount++;
  }

  // Also affect living entities in range
  for (const le of livingEntities) {
    const dist = le.group.position.distanceTo(pushOrigin);
    if (dist > SHOCKWAVE_RADIUS || dist < 0.5) continue;
    const pushDir = le.group.position.clone().sub(pushOrigin).normalize();
    reactLivingEntity(le.group, pushDir);
  }

  showFeedback(hitCount > 0 ? `Force push! (${hitCount} objects)` : "Force push!");
}

function updateFlightMovement(delta: number, forward: THREE.Vector3, right: THREE.Vector3): void {
  // In flight: no gravity, vertical movement via Space/Shift or gamepad
  const flySpeed = MOVE_SPEED * 1.3;
  let vertInput = 0;
  if (pressedKeys.has("Space")) vertInput += 1;
  if (pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight")) vertInput -= 1;
  // Gamepad: A=ascend, B=descend handled via buttons
  const gp = navigator.getGamepads?.()[0];
  if (gp?.buttons[0]?.pressed) vertInput += 1;
  if (gp?.buttons[1]?.pressed) vertInput -= 1;

  // Smooth vertical acceleration for no jitter
  const targetVelY = vertInput * flySpeed * 0.7;
  const smoothFactor = 1 - Math.exp(-8 * delta);
  playerVelY += (targetVelY - playerVelY) * smoothFactor;
  // Snap to zero when near zero and no input to avoid drift
  if (vertInput === 0 && Math.abs(playerVelY) < 0.05) playerVelY = 0;
  playerPos.y += playerVelY * delta;
  // Keep above ground
  const gY = getGroundHeight(playerPos.x, playerPos.z);
  if (playerPos.y < gY + 0.5) playerPos.y = gY + 0.5;
  // Cancel grounded state in flight
  isGrounded = false;
}

// 16D: Laser sight — thin laser pointer line with dot at end
function updateLaserSight(): void {
  if (!camera || !scene) return;
  const origin = camera.position.clone();
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const end = origin.clone().addScaledVector(dir, 60);

  // Raycast to find hit
  raycaster.set(origin, dir);
  raycaster.far = 60;
  if (worldGroup) {
    const hits = raycaster.intersectObjects(worldGroup.children, true);
    if (hits.length > 0) end.copy(hits[0].point);
  }

  if (laserBeam) {
    const positions = laserBeam.geometry.attributes.position as THREE.BufferAttribute;
    positions.setXYZ(0, origin.x, origin.y, origin.z);
    positions.setXYZ(1, end.x, end.y, end.z);
    positions.needsUpdate = true;
  } else {
    const geom = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const mat = new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.25 });
    laserBeam = new THREE.Line(geom, mat);
    scene.add(laserBeam);
  }
}

function updatePowerUI(): void {
  const el = document.getElementById("power-indicator");
  if (!el) return;
  if (currentPower === "none") {
    el.style.opacity = "0";
  } else {
    const labels: Record<PowerType, string> = {
      none: "",
      flight: "✈ Flight",
      laser: "⚡ Laser — Hold to fire",
      telekinesis: "🔮 Telekinesis — Hold to grab, release to throw",
      destruction: "💥 Destruction — Click to destroy",
      shockwave: "🌊 Force Push — Click to blast"
    };
    el.textContent = labels[currentPower];
    el.style.opacity = "1";
    // 16D-E: Flash the label larger briefly on switch
    el.style.fontSize = "1.2rem";
    el.style.transition = "font-size 0.3s ease, opacity 0.4s ease";
    setTimeout(() => {
      el.style.fontSize = "0.95rem";
      if (el && currentPower !== "none") {
        const shortLabels: Record<PowerType, string> = {
          none: "", flight: "✈ Flight", laser: "⚡ Laser",
          telekinesis: "🔮 Telekinesis", destruction: "💥 Destruction",
          shockwave: "🌊 Force Push"
        };
        el.textContent = shortLabels[currentPower];
      }
    }, 2500);
  }
  // 16G: Crosshair style per power — using CSS custom properties
  const crosshair = document.getElementById("crosshair");
  if (crosshair) {
    const colors: Record<PowerType, string> = {
      none: "rgba(255,255,255,0.85)",
      flight: "rgba(100,200,255,0.9)",
      laser: "rgba(255,60,40,0.95)",
      telekinesis: "rgba(140,80,255,0.9)",
      destruction: "rgba(255,140,40,0.9)",
      shockwave: "rgba(80,180,255,0.9)"
    };
    crosshair.style.setProperty("--ch-color", colors[currentPower]);
    if (currentPower === "laser") {
      crosshair.style.setProperty("--ch-size", "10px");
      crosshair.style.setProperty("--ch-border", "1px solid rgba(255,80,60,0.7)");
      crosshair.style.setProperty("--ch-glow", "0 0 6px rgba(255,60,40,0.6)");
    } else if (currentPower === "telekinesis") {
      crosshair.style.setProperty("--ch-size", "20px");
      crosshair.style.setProperty("--ch-border", "2px solid rgba(140,80,255,0.8)");
      crosshair.style.setProperty("--ch-glow", "0 0 8px rgba(140,80,255,0.4)");
    } else if (currentPower === "shockwave") {
      crosshair.style.setProperty("--ch-size", "24px");
      crosshair.style.setProperty("--ch-border", "2px solid rgba(80,180,255,0.7)");
      crosshair.style.setProperty("--ch-glow", "0 0 10px rgba(80,180,255,0.3)");
    } else if (currentPower === "destruction") {
      crosshair.style.setProperty("--ch-size", "14px");
      crosshair.style.setProperty("--ch-border", "1px solid rgba(255,140,40,0.7)");
      crosshair.style.setProperty("--ch-glow", "0 0 8px rgba(255,140,40,0.5)");
    } else {
      crosshair.style.setProperty("--ch-size", "16px");
      crosshair.style.setProperty("--ch-border", "none");
      crosshair.style.setProperty("--ch-glow", "none");
    }
  }
  // 16G: Update power-bar UI
  const powerBar = document.getElementById("power-bar");
  if (powerBar) {
    const items = powerBar.querySelectorAll(".power-bar-item");
    items.forEach((item) => {
      const pw = (item as HTMLElement).dataset.power;
      if (pw === currentPower) {
        item.classList.add("is-active");
      } else {
        item.classList.remove("is-active");
      }
    });
    if (currentPower !== "none") {
      powerBar.classList.add("is-visible");
    }
  }
}

// ── 16G: Superpower roadmap metadata hooks ───────────────────────────
// Objects can be tagged with these for future power interactions:
// userData.movable = true        — telekinesis can grab and move
// userData.destructible = true   — destruction can break
// userData.structuralImportance = "high" | "medium" | "low"

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

  // 16J: Tags that should NOT show interaction prompt (floor/terrain/water/clouds)
  const NON_INTERACTIVE_TAGS = new Set([
    "environment", "environment-cloud", "environment-water", "ground", "terrain"
  ]);

  let foundInteractable = false;
  let hintText = "Press E to interact";
  for (const hit of hits) {
    if (hit.distance > 30) break; // ignore far objects
    const tag = getInteractionTag(hit.object);
    // 16C-F: Check if looking at a movable physics object
    const body = findPhysicsBody(hit.object);
    if (body) {
      lookedAtObject = hit.object;
      const mat = (hit.object as THREE.Mesh).material;
      if (mat instanceof THREE.MeshStandardMaterial) {
        lookedAtOriginalEmissive = mat.emissive.clone();
        lookedAtOriginalIntensity = mat.emissiveIntensity;
        mat.emissive.setHex(0xeebb44);
        mat.emissiveIntensity = Math.min(lookedAtOriginalIntensity + 0.25, 0.9);
      }
      hintText = currentPower === "telekinesis" ? "Hold to grab" :
                 currentPower === "laser" ? "Hold to fire" :
                 currentPower === "destruction" ? "Click to destroy" :
                 currentPower === "shockwave" ? "Click to push" : "Movable object";
      foundInteractable = true;
      break;
    }
    if (tag && !NON_INTERACTIVE_TAGS.has(tag)) {
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
      // 16E-D: Context-aware hints for non-movable objects
      const root = findLandmarkRoot(hit.object);
      if (root.userData.destructible) {
        const dmg = root.userData.destructDamage || 0;
        const threshold = root.userData.massClass === "heavy" ? 3 : root.userData.massClass === "medium" ? 2 : 1;
        if (dmg > 0 && dmg < threshold) {
          hintText = currentPower === "destruction" ? "Click to finish it off!" :
                     currentPower === "laser" ? "Hold to melt" : "Damaged — breakable";
        } else {
          hintText = currentPower === "destruction" ? "Click to destroy" :
                     currentPower === "laser" ? "Hold to fire" : "Breakable";
        }
      }
      foundInteractable = true;
      break;
    }
  }

  // UI hint
  if (interactionHint) {
    interactionHint.style.display = foundInteractable ? "block" : "none";
    if (foundInteractable) interactionHint.textContent = hintText;
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

function findLandmarkRoot(obj: THREE.Object3D): THREE.Object3D {
  let current: THREE.Object3D = obj;
  while (current.parent && current.parent !== worldGroup) {
    current = current.parent;
  }
  return current;
}

function triggerInteraction(): void {
  if (!lookedAtObject) return;

  const tag = getInteractionTag(lookedAtObject) ?? "unknown";
  let message = "";

  playInteractionSound();

  if (tag === "primary_landmark") {
    message = "The heart of the dream pulses before you...";

    // Strong pulse: cascade emissive glow through all meshes in the group
    const root = findLandmarkRoot(lookedAtObject);
    root.traverse((child: THREE.Object3D) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mat = child.material;
      if (!(mat instanceof THREE.MeshStandardMaterial)) return;
      const origI = mat.emissiveIntensity;
      const origC = mat.emissive.clone();
      mat.emissive.setHex(0x88bbff);
      mat.emissiveIntensity = 2.0;
      setTimeout(() => {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissiveIntensity = origI;
          mat.emissive.copy(origC);
        }
      }, 800);
    });
    // Visual reward: gentle uplift
    const origY = root.position.y;
    root.position.y += 0.5;
    setTimeout(() => { root.position.y = origY; }, 600);
  } else if (tag.startsWith("structure")) {
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

function updateFloating(): void {
  const time = performance.now() / 1000;

  floatingGroups.forEach(({ group, baseY, phase }) => {
    group.position.y = baseY + Math.sin(time * FLOAT_SPEED + phase) * FLOAT_AMPLITUDE;
    group.rotation.y = Math.sin(time * 0.15 + phase) * 0.1;
    // 16F: Subtle secondary rock — gentle x-axis oscillation
    group.rotation.x = Math.sin(time * 0.3 + phase * 1.5) * 0.015;
  });

  cloudJitters.forEach(({ mesh, base, phase }) => {
    mesh.position.y = base.y + Math.sin(time * 0.4 + phase) * 0.06;
    // 16F: Enhanced lateral cloud drift — larger, slower movement
    mesh.position.x = base.x + Math.sin(time * 0.05 + phase * 1.3) * 1.2 + Math.sin(time * 0.12 + phase) * 0.3;
    mesh.position.z = base.z + Math.cos(time * 0.04 + phase * 0.9) * 0.9 + Math.cos(time * 0.09 + phase * 1.1) * 0.2;
  });

  cityEmissives.forEach(({ material, base, phase }) => {
    material.emissiveIntensity = base + Math.sin(time * 0.35 + phase) * 0.12;
  });

  oceanWaveMeshes.forEach((mesh, i) => {
    mesh.position.y = (mesh.userData.baseY as number) + Math.sin(time * 0.5 + i * 1.2) * 0.08;
  });

  // 16F: Grass / vegetation sway
  swayMeshes.forEach(({ mesh, baseRotZ, phase, amplitude }) => {
    mesh.rotation.z = baseRotZ + Math.sin(time * 1.8 + phase) * amplitude;
  });

  // 16F: Water flow undulation
  waterFlowMeshes.forEach(({ mesh, baseY, phase }) => {
    mesh.position.y = baseY + Math.sin(time * 0.7 + phase) * 0.15;
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
  // 20B: Streaming disabled for cave scenes — enclosed space is whole world
  if (activeSceneType === "cave") return;

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

// ── 16F: Collect natural motion targets from worldGroup ──────────────
function collectNaturalMotion(): void {
  swayMeshes.length = 0;
  waterFlowMeshes.length = 0;
  if (!worldGroup) return;
  let swayIdx = 0;
  worldGroup.traverse((obj: THREE.Object3D) => {
    // Grass blades marked with swayable
    if (obj.userData.swayable) {
      swayMeshes.push({
        mesh: obj,
        baseRotZ: obj.rotation.z,
        phase: swayIdx * 2.1,
        amplitude: 0.08 + Math.random() * 0.06
      });
      swayIdx++;
    }
    // Ocean / water meshes
    if (obj instanceof THREE.Mesh && obj.userData.interactionTag === "environment-water") {
      waterFlowMeshes.push({
        mesh: obj,
        baseY: obj.position.y,
        phase: Math.random() * Math.PI * 2
      });
    }
  });
}

// ── Density & Layer System (14A) ─────────────────────────────────────

type DensityLevel = "low" | "medium" | "high";

function inferDensityLevel(semantics: SemanticTags): DensityLevel {
  // 19E: Use explicit density from semantic inference (supports crowd hints from 19A)
  if (semantics.density === "dense" || semantics.density === "endless") return "high";
  if (semantics.density === "sparse") return "low";
  if (semantics.scale === "giant" || semantics.scale === "endless") return "high";
  if (semantics.scale === "tiny") return "low";
  if (semantics.mood === "chaotic" || semantics.mood === "mystical") return "high";
  return "medium";
}

function densityCounts(level: DensityLevel): { ground: number; mid: number; upper: number; background: number } {
  switch (level) {
    case "high": return { ground: 55, mid: 25, upper: 8, background: 14 };
    case "medium": return { ground: 38, mid: 18, upper: 5, background: 10 };
    case "low": return { ground: 22, mid: 10, upper: 2, background: 8 };
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
  const scene = activeSceneType;

  // 17C/18F/20B: Scatter radius for density layers — wider for flyable exploration
  const SCATTER_RADIUS = 60;
  const CENTER_EXCLUSION = 9;

  // --- Ground layer: small terrain detail — distributed across zones ---
  for (let i = 0; i < counts.ground; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = CENTER_EXCLUSION + rng() * (SCATTER_RADIUS - CENTER_EXCLUSION);
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (placedPositions.some((p) => p.distanceTo(pos) < 3)) continue;
    const detail = createGroundDetail(rng, env, sm, scene);
    detail.position.copy(pos);
    worldGroup.add(detail);
  }

  // --- Mid layer: filler structures — spread into mid zone ---
  const midRadius = SCATTER_RADIUS;
  const midCount = counts.mid;
  for (let i = 0; i < midCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = CENTER_EXCLUSION + 3 + rng() * midRadius;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (placedPositions.some((p) => p.distanceTo(pos) < SCALE.minSpacing)) continue;
    const filler = createMidLayerFiller(rng, env, sm, scene);
    filler.position.copy(pos);
    worldGroup.add(filler);
  }

  // --- Upper layer: floating elements (only for sky/surreal scenes) ---
  const upperCount = (scene === "cave") ? 0
    : (scene === "sky" || scene === "surreal") ? counts.upper : Math.min(counts.upper, 2);
  for (let i = 0; i < upperCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 8 + rng() * 35;
    const y = 15 + rng() * 25;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
    const floating = createUpperLayerElement(rng, env, sm);
    floating.position.copy(pos);
    floating.userData.floating = true;
    floatingGroups.push({ group: floating, baseY: y, phase: rng() * Math.PI * 2 });
    worldGroup.add(floating);
  }

  // --- Background layer: distant silhouettes ---
  const bgCount = counts.background;
  for (let i = 0; i < bgCount; i++) {
    const angle = (i / counts.background) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const dist = 55 + rng() * 50;
    const silhouette = createBackgroundSilhouette(rng, env, sm, scene);
    silhouette.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    worldGroup.add(silhouette);
  }

  // ── 18C: Living presence — scene-specific density boost ──
  // 18C: City and interior get many more humanoids; beach/forest get more life
  const basePresenceCount = density === "high" ? 16 : density === "medium" ? 11 : 6;
  const presenceCount = (scene === "city") ? Math.max(basePresenceCount, 22)
    : (scene === "beach") ? Math.max(basePresenceCount, 16)
    : (scene === "forest") ? Math.max(basePresenceCount, 14)
    : (scene === "arena" || scene === "temple") ? Math.max(basePresenceCount, 12)
    : basePresenceCount;
  // 17B: Scene-aware type weights: [humanoid, animal, creature]
  let presenceWeights: number[];
  switch (scene) {
    case "beach":    presenceWeights = [0.6, 0.25, 0.15]; break;
    case "city":     presenceWeights = [0.88, 0.02, 0.10]; break;
    case "forest":   presenceWeights = [0.1, 0.75, 0.15]; break;
    case "temple":   presenceWeights = [0.5, 0.1, 0.4]; break;
    case "arena":    presenceWeights = [0.65, 0.05, 0.3]; break;
    case "ocean":    presenceWeights = [0.2, 0.5, 0.3]; break;
    case "mountain": presenceWeights = [0.2, 0.5, 0.3]; break;
    case "cave":     presenceWeights = [0.1, 0.3, 0.6]; break;
    case "surreal":  presenceWeights = [0.1, 0.1, 0.8]; break;
    case "desert":   presenceWeights = [0.3, 0.3, 0.4]; break;
    default:         presenceWeights = [0.4, 0.3, 0.3]; break;
  }
  for (let i = 0; i < presenceCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = CENTER_EXCLUSION + rng() * SCATTER_RADIUS;
    const bx = Math.cos(angle) * dist;
    const bz = Math.sin(angle) * dist;
    const pos = new THREE.Vector3(bx, getTerrainNoiseY(bx, bz), bz);
    if (placedPositions.some((p) => p.distanceTo(pos) < 2)) continue;
    const roll = rng();
    const creatorIdx = roll < presenceWeights[0] ? 0 : roll < presenceWeights[0] + presenceWeights[1] ? 1 : 2;
    const being = livingPresenceCreators[creatorIdx](rng);
    const s = 1.8 + rng() * 0.4;
    being.scale.set(s, s, s);
    being.position.copy(pos);
    being.userData.interactionTag = "living-presence";
    worldGroup.add(being);
  }

  // 18C: Beach turtles — spawn near shore (negative Z toward water)
  if (scene === "beach") {
    const turtleCount = 4 + Math.floor(rng() * 5);
    for (let ti = 0; ti < turtleCount; ti++) {
      const turtle = createTurtleGroup(rng);
      const s = 1.8 + rng() * 0.8;
      turtle.scale.set(s, s, s);
      // Spread turtles naturally along shoreline
      const turtleAngle = (ti / turtleCount) * Math.PI * 2;
      const tx = (rng() - 0.5) * SCATTER_RADIUS * 0.9;
      const tz = -(2 + rng() * 15); // closer to water at negative Z
      turtle.position.set(tx, getTerrainNoiseY(tx, tz), tz);
      turtle.rotation.y = turtleAngle;
      turtle.userData.interactionTag = "living-presence";
      worldGroup.add(turtle);
    }
  }

  // 18C: Landmark companions — spawn small cluster near primary landmark
  // so the landmark feels inhabited when the player first sees it
  if (placedPositions.length > 0) {
    const landmarkPos = placedPositions[0]; // first placed = primary/anchor
    const companionCount = scene === "city" ? 4 + Math.floor(rng() * 4)
      : scene === "temple" || scene === "arena" ? 3 + Math.floor(rng() * 3)
      : scene === "beach" ? 2 + Math.floor(rng() * 2)
      : scene === "forest" ? 1 + Math.floor(rng() * 2)
      : 0;
    for (let ci = 0; ci < companionCount; ci++) {
      const cAngle = rng() * Math.PI * 2;
      const cDist = 4 + rng() * 7;
      const cx = landmarkPos.x + Math.cos(cAngle) * cDist;
      const cz = landmarkPos.z + Math.sin(cAngle) * cDist;
      const cPos = new THREE.Vector3(cx, getTerrainNoiseY(cx, cz), cz);
      let companion: THREE.Group;
      if (scene === "beach" && rng() < 0.4) {
        companion = createTurtleGroup(rng);
        companion.scale.set(1.8, 1.8, 1.8);
      } else if (scene === "forest" || scene === "mountain" || scene === "ocean") {
        companion = createAnimalGroup(rng);
        companion.scale.set(1.8, 1.8, 1.8);
      } else if (scene === "cave" || scene === "surreal") {
        companion = createCreatureGroup(rng);
        companion.scale.set(1.6, 1.6, 1.6);
      } else {
        companion = createHumanoidGroup(rng);
        companion.scale.set(1.9, 1.9, 1.9);
      }
      companion.position.copy(cPos);
      companion.userData.interactionTag = "living-presence";
      worldGroup.add(companion);
    }
  }
}

// ── 17B: Scene-to-environment mapping for density layers ─────────────
// Maps scene types to the appropriate ground/mid-layer environment
// so that scene-irrelevant objects (mountains on beach, etc.) don't spawn
function sceneToGroundEnv(scene: SceneType, fallback: EnvironmentType): EnvironmentType {
  const map: Record<SceneType, EnvironmentType> = {
    beach: "coastal", ocean: "ocean", city: "city", forest: "forest",
    mountain: "mountain", cave: "cave", arena: "ruins", temple: "ruins",
    interior: "city", desert: "desert", frozen: "frozen", sky: "sky",
    surreal: "surreal", generic: fallback,
  };
  return map[scene] ?? fallback;
}

function createGroundDetail(rng: () => number, env: EnvironmentType, sm: number, scene?: SceneType): THREE.Group {
  const group = new THREE.Group();

  // 17B/19D: Use scene type for ground detail selection when available
  const effectiveEnv = scene ? sceneToGroundEnv(scene, env) : env;

  if (effectiveEnv === "forest" || effectiveEnv === "generic") {
    // 16D: Grass clumps + bushes
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x2a5a22, roughness: 0.9, side: THREE.DoubleSide });
    const grassBladeCount = 4 + Math.floor(rng() * 8);
    for (let i = 0; i < grassBladeCount; i++) {
      const bladeH = (0.3 + rng() * 0.5) * sm;
      const blade = new THREE.Mesh(
        new THREE.PlaneGeometry(0.06 * sm, bladeH),
        grassMat
      );
      blade.position.set((rng() - 0.5) * 4, bladeH / 2, (rng() - 0.5) * 4);
      blade.rotation.y = rng() * Math.PI;
      blade.rotation.z = (rng() - 0.5) * 0.3;
      blade.userData.swayable = true;
      group.add(blade);
    }
    const count = 2 + Math.floor(rng() * 3);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e3a1a, roughness: 0.85 });
    for (let i = 0; i < count; i++) {
      const r = (0.3 + rng() * 0.6) * sm;
      const bush = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), leafMat);
      bush.position.set((rng() - 0.5) * 3, r * 0.5, (rng() - 0.5) * 3);
      bush.castShadow = true;
      group.add(bush);
    }
  } else if (effectiveEnv === "city") {
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
  } else if (effectiveEnv === "ocean") {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a6570, roughness: 0.85 });
    const r = (0.4 + rng() * 1.0) * sm;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
    rock.position.y = r * 0.2;
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    rock.castShadow = true;
    group.add(rock);
  } else if (effectiveEnv === "desert") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb89d6a, roughness: 0.95 });
    const r = (0.5 + rng() * 1.5) * sm;
    const dune = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 4), mat);
    dune.scale.y = 0.3;
    dune.position.y = r * 0.1;
    group.add(dune);
  } else if (effectiveEnv === "mountain") {
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
  } else if (effectiveEnv === "sky") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.9, transparent: true, opacity: 0.5 });
    const r = (0.5 + rng() * 1.5) * sm;
    const wisp = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), mat);
    wisp.scale.y = 0.3;
    wisp.position.y = 0.5 + rng() * 3;
    group.add(wisp);
  } else if (effectiveEnv === "coastal") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xa0967a, roughness: 0.9 });
    const count = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const r = (0.2 + rng() * 0.5) * sm;
      const shell = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
      shell.scale.y = 0.4;
      shell.position.set((rng() - 0.5) * 3, r * 0.1, (rng() - 0.5) * 3);
      shell.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
      group.add(shell);
    }
    // 18B: Beach foam edge — flat white strips, more frequent and layered
    const foamChance = rng();
    if (foamChance < 0.75) {
      const foamCount = 1 + Math.floor(rng() * 3);
      for (let fi = 0; fi < foamCount; fi++) {
        const foamMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, roughness: 0.95, transparent: true, opacity: 0.25 + rng() * 0.25
        });
        const fw = (2 + rng() * 3) * sm;
        const foam = new THREE.Mesh(new THREE.PlaneGeometry(fw, (0.2 + rng() * 0.3) * sm), foamMat);
        foam.rotation.x = -Math.PI / 2;
        foam.position.set((rng() - 0.5) * 2, 0.02 + fi * 0.005, (rng() - 0.5) * 1);
        group.add(foam);
      }
    }
  } else if (effectiveEnv === "cave") {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.9 });
    const h = (0.5 + rng() * 1.5) * sm;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2 * sm, h, 5), mat);
    spike.position.y = h / 2;
    group.add(spike);
  } else if (effectiveEnv === "frozen") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc0d8ee, roughness: 0.1, transparent: true, opacity: 0.7 });
    const r = (0.3 + rng() * 0.7) * sm;
    const chunk = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), mat);
    chunk.position.y = r * 0.3;
    chunk.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    group.add(chunk);
  } else if (effectiveEnv === "storm" || effectiveEnv === "celestial") {
    const mat = new THREE.MeshStandardMaterial({
      color: effectiveEnv === "storm" ? 0x4a6a8a : 0x8a8aff,
      emissive: new THREE.Color(effectiveEnv === "storm" ? 0x2a4a6a : 0x4a4aaa),
      emissiveIntensity: 0.3, roughness: 0.3
    });
    const r = (0.1 + rng() * 0.3) * sm;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), mat);
    spark.position.set((rng() - 0.5) * 3, 0.5 + rng() * 2, (rng() - 0.5) * 3);
    group.add(spark);
  } else if (effectiveEnv === "ruins") {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.9 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const r = (0.2 + rng() * 0.6) * sm;
      const rubble = new THREE.Mesh(new THREE.BoxGeometry(r, r * 0.6, r), mat);
      rubble.position.set((rng() - 0.5) * 3, r * 0.3, (rng() - 0.5) * 3);
      rubble.rotation.set(rng() * 0.3, rng() * Math.PI, rng() * 0.3);
      group.add(rubble);
    }
  } else if (effectiveEnv === "surreal") {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a6aa0, roughness: 0.2,
      emissive: new THREE.Color(0x4a2a6a), emissiveIntensity: 0.2,
      transparent: true, opacity: 0.6
    });
    const r = (0.3 + rng() * 0.8) * sm;
    const shape = rng() < 0.5
      ? new THREE.Mesh(new THREE.TetrahedronGeometry(r, 0), mat)
      : new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), mat);
    shape.position.set((rng() - 0.5) * 2, r + rng() * 2, (rng() - 0.5) * 2);
    shape.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    group.add(shape);
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

function createMidLayerFiller(rng: () => number, env: EnvironmentType, sm: number, scene?: SceneType): THREE.Group {
  const group = new THREE.Group();
  const effectiveEnv = scene ? sceneToGroundEnv(scene, env) : env;

  // 18I: Coastal/beach filler — palm trees, sand ripples
  if (effectiveEnv === "coastal" || scene === "beach") {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a2a, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a7a2a, roughness: 0.7 });
    const palmCount = 1 + Math.floor(rng() * 3);
    for (let pi = 0; pi < palmCount; pi++) {
      const trunkH = (4 + rng() * 4) * sm;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, trunkH, 7), trunkMat);
      trunk.rotation.z = (rng() - 0.5) * 0.3;
      trunk.position.set((rng() - 0.5) * 18, trunkH / 2, (rng() - 0.5) * 18);
      trunk.castShadow = true;
      group.add(trunk);
      const frondCount = 4 + Math.floor(rng() * 3);
      for (let fi = 0; fi < frondCount; fi++) {
        const fa = (fi / frondCount) * Math.PI * 2;
        const frond = new THREE.Mesh(new THREE.SphereGeometry(0.9 + rng() * 0.5, 7, 5), leafMat);
        frond.scale.y = 0.28;
        frond.position.set(
          trunk.position.x + Math.cos(fa) * 1.8,
          trunkH + 0.5,
          trunk.position.z + Math.sin(fa) * 1.8
        );
        group.add(frond);
      }
    }
    const rippleMat = new THREE.MeshStandardMaterial({ color: 0xc8a860, roughness: 0.98, transparent: true, opacity: 0.6 });
    for (let ri = 0; ri < 3; ri++) {
      const rR = (1.5 + rng() * 2) * sm;
      const ripple = new THREE.Mesh(new THREE.CircleGeometry(rR, 8), rippleMat);
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set((rng() - 0.5) * 16, 0.02, (rng() - 0.5) * 16);
      group.add(ripple);
    }
    return group;
  }

  if (effectiveEnv === "city") {
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
      // 18B: Emissive window dots — brighter and more frequent for city nights
      if (activeSceneType === "city" && rng() < 0.85) {
        const isNight = activeSemantics?.time === "night";
        const isSunset = activeSemantics?.time === "sunset";
        const nightBoost = (isNight || isSunset) ? 1.2 : 0.7;
        const winColor = rng() < 0.5 ? 0xffcc66 : rng() < 0.5 ? 0x99ddff : 0xffeebb;
        const winMat = new THREE.MeshStandardMaterial({
          color: winColor, emissive: new THREE.Color(winColor),
          emissiveIntensity: 0.85 * nightBoost, roughness: 0.15
        });
        const winCount = 4 + Math.floor(rng() * 6);
        for (let wi = 0; wi < winCount; wi++) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(0.4 * sm, 0.3 * sm), winMat);
          const face = Math.floor(rng() * 4);
          const faceAngle = (face / 4) * Math.PI * 2;
          win.position.set(
            building.position.x + Math.cos(faceAngle) * (w / 2 + 0.02),
            building.position.y - h / 2 + 1 + rng() * (h - 2),
            building.position.z + Math.sin(faceAngle) * (w / 2 + 0.02)
          );
          win.rotation.y = faceAngle;
          group.add(win);
          cityEmissives.push({ material: winMat, base: 0.85 * nightBoost, phase: rng() * Math.PI * 2 });
        }
      }
    }
  } else if (effectiveEnv === "forest") {
    const count = 3 + Math.floor(rng() * 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });
    const leafColors = [0x1a4a2a, 0x1e5a2e, 0x2a5a22, 0x1a3a28];
    for (let i = 0; i < count; i++) {
      const leafMat = new THREE.MeshStandardMaterial({ color: leafColors[i % leafColors.length], roughness: 0.7 });
      const trunkH = (SCALE.trunkH.min + rng() * (SCALE.trunkH.max - SCALE.trunkH.min)) * sm * (0.8 + rng() * 0.6);
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
    // 18B: Undergrowth ferns beneath trees
    const fernMat = new THREE.MeshStandardMaterial({ color: 0x2a5a22, roughness: 0.85, side: THREE.DoubleSide });
    for (let fi = 0; fi < 4; fi++) {
      const fernH = (0.4 + rng() * 0.6) * sm;
      const fern = new THREE.Mesh(new THREE.PlaneGeometry(0.8 * sm, fernH), fernMat);
      fern.position.set((rng() - 0.5) * 16, fernH / 2, (rng() - 0.5) * 16);
      fern.rotation.y = rng() * Math.PI;
      group.add(fern);
    }
  } else if (effectiveEnv === "ocean") {
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
  } else if (effectiveEnv === "mountain") {
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
  } else if (effectiveEnv === "desert") {
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
  } else if (effectiveEnv === "sky") {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe0e4ea, roughness: 0.9, transparent: true, opacity: 0.7 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const r = (3 + rng() * 6) * sm;
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat);
      cloud.scale.y = 0.2 + rng() * 0.15;
      cloud.position.set((rng() - 0.5) * 40, rng() * 15, (rng() - 0.5) * 40);
      group.add(cloud);
    }
  } else if (effectiveEnv === "cave") {
    const darkRock = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.9 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const h = (2 + rng() * 5) * sm;
      const r = (0.4 + rng() * 0.8) * sm;
      const stalagmite = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), darkRock);
      stalagmite.position.set((rng() - 0.5) * 15, h / 2, (rng() - 0.5) * 15);
      stalagmite.castShadow = true;
      group.add(stalagmite);
    }
  } else if (effectiveEnv === "frozen") {
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xb8d8e8, roughness: 0.05, transparent: true, opacity: 0.7 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const w = (2 + rng() * 5) * sm;
      const h = (2 + rng() * 6) * sm;
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.7), iceMat);
      block.position.set((rng() - 0.5) * 20, h / 2, (rng() - 0.5) * 20);
      block.rotation.y = rng() * Math.PI;
      block.castShadow = true;
      group.add(block);
    }
  } else if (effectiveEnv === "ruins") {
    const ruinMat = new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.85 });
    const count = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const h = (2 + rng() * 6) * sm;
      const w = (1 + rng() * 2) * sm;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.3), ruinMat);
      wall.position.set((rng() - 0.5) * 18, h / 2, (rng() - 0.5) * 18);
      wall.rotation.y = rng() * Math.PI;
      wall.rotation.z = (rng() - 0.5) * 0.2;
      wall.castShadow = true;
      group.add(wall);
    }
  } else if (effectiveEnv === "surreal" || effectiveEnv === "celestial") {
    const glowMat = new THREE.MeshStandardMaterial({
      color: effectiveEnv === "surreal" ? 0x8a6aa0 : 0x88aadd,
      roughness: 0.2, metalness: 0.3,
      emissive: new THREE.Color(effectiveEnv === "surreal" ? 0x4a2a6a : 0x4466aa),
      emissiveIntensity: 0.3, transparent: true, opacity: 0.6
    });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const s = (1 + rng() * 3) * sm;
      const type = Math.floor(rng() * 3);
      const mesh = type === 0 ? new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), glowMat)
        : type === 1 ? new THREE.Mesh(new THREE.TorusGeometry(s, s * 0.25, 8, 16), glowMat)
        : new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), glowMat);
      mesh.position.set((rng() - 0.5) * 20, 2 + rng() * 10, (rng() - 0.5) * 20);
      mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      mesh.castShadow = true;
      group.add(mesh);
    }
  } else if (effectiveEnv === "storm") {
    // Dark windswept debris
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a4a50, roughness: 0.8 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const h = (2 + rng() * 4) * sm;
      const w = (1 + rng() * 2) * sm;
      const debris = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.4), mat);
      debris.position.set((rng() - 0.5) * 18, h / 2, (rng() - 0.5) * 18);
      debris.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI, (rng() - 0.5) * 0.25);
      debris.castShadow = true;
      group.add(debris);
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

function createBackgroundSilhouette(rng: () => number, env: EnvironmentType, sm: number, scene?: SceneType): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1e28, fog: true });
  const effectiveEnv = scene ? sceneToGroundEnv(scene, env) : env;

  // 18I: Beach/coastal scenes get coastal background (no random mountains)
  if (scene === "beach" || effectiveEnv === "coastal" || effectiveEnv === "ocean") {
    // Distant water horizon haze + optional far city silhouette
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0x2a3e5a, fog: true, transparent: true, opacity: 0.4 });
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const r = (18 + rng() * 30) * sm;
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), cloudMat);
      cloud.scale.y = 0.12;
      cloud.position.set((rng() - 0.5) * 60, 12 + rng() * 10, (rng() - 0.5) * 30);
      group.add(cloud);
    }
    // Far city on horizon (beach by city)
    if (rng() < 0.5) {
      const bldCount = 3 + Math.floor(rng() * 4);
      for (let bi = 0; bi < bldCount; bi++) {
        const w = (2 + rng() * 4) * sm;
        const h = (8 + rng() * 25) * sm;
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
        building.position.set((rng() - 0.5) * 50, h / 2, (rng() - 0.5) * 15);
        group.add(building);
      }
    }
    return group;
  }

  // 18I: Forest scenes get tree-line silhouettes, not mountains
  if (scene === "forest" || effectiveEnv === "forest") {
    const count = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i++) {
      const h = (18 + rng() * 30) * sm;
      const r = (6 + rng() * 10) * sm;
      const treeMat = new THREE.MeshBasicMaterial({ color: 0x0a1a0a, fog: true });
      const tree = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), treeMat);
      tree.position.set((rng() - 0.5) * 60, h / 2, (rng() - 0.5) * 30);
      group.add(tree);
    }
    return group;
  }

  const roll = rng();
  if (roll < 0.3 || effectiveEnv === "mountain") {
    // Distant mountain range
    const count = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const h = (30 + rng() * 60) * sm;
      const r = (15 + rng() * 25) * sm;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat);
      peak.position.set((rng() - 0.5) * 60, h / 2, (rng() - 0.5) * 40);
      group.add(peak);
    }
  } else if (roll < 0.6 || effectiveEnv === "city") {
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
  } else if (roll < 0.8 && (effectiveEnv === "frozen" || effectiveEnv === "cave" || effectiveEnv === "ruins")) {
    // Distant dark formations
    const count = 3 + Math.floor(rng() * 4);
    const color = effectiveEnv === "frozen" ? 0x1a2a3a : effectiveEnv === "cave" ? 0x121218 : 0x2a2520;
    const darkMat = new THREE.MeshBasicMaterial({ color, fog: true });
    for (let i = 0; i < count; i++) {
      const h = (15 + rng() * 40) * sm;
      const r = (6 + rng() * 12) * sm;
      const form = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), darkMat);
      form.position.set((rng() - 0.5) * 60, h / 2, (rng() - 0.5) * 40);
      group.add(form);
    }
  } else if (effectiveEnv === "surreal" || effectiveEnv === "celestial") {
    // Floating abstract silhouettes
    const count = 3 + Math.floor(rng() * 4);
    const surrMat = new THREE.MeshBasicMaterial({ color: 0x1a1030, fog: true, transparent: true, opacity: 0.6 });
    for (let i = 0; i < count; i++) {
      const s = (10 + rng() * 20) * sm;
      const shape = rng() < 0.5
        ? new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), surrMat)
        : new THREE.Mesh(new THREE.TorusGeometry(s, s * 0.2, 6, 12), surrMat);
      shape.position.set((rng() - 0.5) * 60, 10 + rng() * 50, (rng() - 0.5) * 40);
      shape.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      group.add(shape);
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

// ── 14C: Visual Hierarchy & Landmark Enhancement ─────────────────────

function applyVisualHierarchy(
  rng: () => number,
  world: WorldModel,
  groupById: GroupMap,
  sm: number
): void {
  if (!worldGroup) return;

  for (const entity of world.entities) {
    const group = groupById.get(entity.id);
    if (!group) continue;

    if (entity.landmarkRole === "primary_landmark") {
      // 20D: Enforce minimum landmark size — if too small, scale up aggressively
      const bbox = new THREE.Box3().setFromObject(group);
      const bboxSize = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
      const minBoost = maxDim < 3 ? 2.5 : maxDim < 6 ? 1.8 : 1.35;
      group.scale.multiplyScalar(minBoost);

      // Add strong emissive glow to all meshes
      group.traverse((obj: THREE.Object3D) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        if (!mat.emissive) mat.emissive = new THREE.Color(0x000000);
        mat.emissive.lerp(new THREE.Color(0x6688cc), 0.4);
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.35);
      });

      // Tag as primary landmark for interaction
      group.userData.interactionTag = "primary_landmark";
      group.userData.landmarkRole = "primary_landmark";
      group.traverse((child: THREE.Object3D) => {
        child.userData.interactionTag = "primary_landmark";
        child.userData.landmarkRole = "primary_landmark";
      });

      // Add a subtle point light at the primary landmark to draw eye
      const wp = group.getWorldPosition(new THREE.Vector3());
      const beacon = new THREE.PointLight(0x6688cc, 0.8, 60, 1.5);
      beacon.position.set(wp.x, wp.y + 8 * sm, wp.z);
      worldGroup.add(beacon);

    } else if (entity.landmarkRole === "secondary_landmark") {
      // Slight scale boost for secondary landmarks
      group.scale.multiplyScalar(1.12);

      // Mild emissive highlight
      group.traverse((obj: THREE.Object3D) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material;
        if (!(mat instanceof THREE.MeshStandardMaterial)) return;
        if (!mat.emissive) mat.emissive = new THREE.Color(0x000000);
        mat.emissive.lerp(new THREE.Color(0x445566), 0.2);
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 0.15);
      });

      // Tag as secondary landmark
      group.userData.interactionTag = "landmark";
      group.userData.landmarkRole = "secondary_landmark";
      group.traverse((child: THREE.Object3D) => {
        child.userData.interactionTag = "landmark";
        child.userData.landmarkRole = "secondary_landmark";
      });
    }
    // background entities stay unmodified — low detail by design
  }
}

// ── 14C-D: Path / Flow from Spawn toward Primary Landmark ───────────

function layPathTowardPrimary(
  rng: () => number,
  world: WorldModel,
  groupById: GroupMap,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup || !world.primaryLandmarkId) return;

  const primaryGroup = groupById.get(world.primaryLandmarkId);
  if (!primaryGroup) return;

  const primaryPos = primaryGroup.getWorldPosition(new THREE.Vector3());

  // Determine spawn direction (roughly opposite to primary from center)
  // The spawn will be placed later, but the path leads FROM outer edge TO primary
  // We place "breadcrumb" objects leading inward
  const pathDir = primaryPos.clone().setY(0).normalize();
  if (pathDir.lengthSq() < 0.01) return; // primary is at exact center

  // Start ~30 units out from primary and work inward with breadcrumb markers
  const pathOrigin = primaryPos.clone().setY(0);
  const pathStartDist = 35;
  const pathSteps = 8 + Math.floor(rng() * 4);

  // Path material: subtle, low-profile stones/markers
  const pathMat = new THREE.MeshStandardMaterial({
    color: 0x7a7a80, roughness: 0.85,
    emissive: new THREE.Color(0x334455), emissiveIntensity: 0.08
  });

  const perpDir = new THREE.Vector3(-pathDir.z, 0, pathDir.x); // perpendicular

  for (let i = 0; i < pathSteps; i++) {
    const t = i / (pathSteps - 1); // 0..1 (outer to inner)
    const dist = pathStartDist * (1 - t * 0.85); // starts far, ends near primary
    const basePos = pathOrigin.clone()
      .addScaledVector(pathDir, -dist)
      .addScaledVector(perpDir, (rng() - 0.5) * 4);

    if (tooClose(basePos, placedPositions, 4)) continue;

    // Breadcrumb stone — gets slightly larger near primary
    const sizeFactor = 0.5 + t * 0.5;
    const r = (0.3 + rng() * 0.5) * sm * sizeFactor;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), pathMat);
    stone.position.set(basePos.x, r * 0.3, basePos.z);
    stone.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    worldGroup.add(stone);

    // Occasional side-path hints: small flanking objects
    if (rng() < 0.35) {
      const sideOffset = (rng() < 0.5 ? 1 : -1) * (2 + rng() * 3);
      const sr = r * 0.6;
      const sideStone = new THREE.Mesh(new THREE.DodecahedronGeometry(sr, 0), pathMat);
      sideStone.position.set(
        basePos.x + perpDir.x * sideOffset,
        sr * 0.3,
        basePos.z + perpDir.z * sideOffset
      );
      sideStone.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
      worldGroup.add(sideStone);
    }
  }

  // Place alignment gaps: ensure no mid-layer filler directly on the path corridor
  // (This is handled by the center exclusion in populateDensityLayers)
}

// ── 14B: Archetype-Aware World Building ──────────────────────────────

function buildArchetypeEnvironment(
  rng: () => number,
  archetype: EnvironmentArchetype,
  semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number,
  dreamProfile?: DreamProfile
): void {
  if (!worldGroup) return;

  const builders: Record<EnvironmentArchetype, () => void> = {
    floating_city: () => buildFloatingCity(rng, semantics, placedPositions, sm),
    ocean_realm: () => buildOceanRealm(rng, semantics, placedPositions, sm),
    forest_ruins: () => buildForestRuins(rng, semantics, placedPositions, sm),
    storm_void: () => buildStormVoid(rng, semantics, placedPositions, sm),
    surreal_desert: () => buildSurrealDesert(rng, semantics, placedPositions, sm),
    castle_sky: () => buildCastleSky(rng, semantics, placedPositions, sm),
    dream_zone: () => buildDreamZone(rng, semantics, placedPositions, sm, dreamProfile),
  };

  builders[archetype]();
}

function tooClose(pos: THREE.Vector3, existing: THREE.Vector3[], minDist: number): boolean {
  return existing.some((p) => p.distanceTo(pos) < minDist);
}

// ── 15D: Palette-aware material helpers ──────────────────────────────
function paletteAccent(palette: ColorPalette | undefined): number {
  switch (palette) {
    case "warm":    return 0xcc8844;
    case "cool":    return 0x44aacc;
    case "dark":    return 0x3a3a5a;
    case "vibrant": return 0xaa44cc;
    case "muted":   return 0x8a8a7a;
    default:        return 0x6a7aaa;
  }
}

function paletteEmissive(palette: ColorPalette | undefined): number {
  switch (palette) {
    case "warm":    return 0x8a4420;
    case "cool":    return 0x204a8a;
    case "dark":    return 0x1a1a3a;
    case "vibrant": return 0x6a20aa;
    case "muted":   return 0x3a3a30;
    default:        return 0x4a5a8a;
  }
}

function buildFloatingCity(
  rng: () => number,
  semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup) return;
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5, metalness: 0.2 });
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xe8eaf0, roughness: 0.8, transparent: true, opacity: 0.55 });

  // Cloud shelf / layered platforms
  for (let i = 0; i < 6; i++) {
    const r = (12 + rng() * 20) * sm;
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), cloudMat);
    cloud.scale.y = 0.12 + rng() * 0.08;
    const pos = new THREE.Vector3((rng() - 0.5) * 60, -2 + rng() * 4, (rng() - 0.5) * 60);
    cloud.position.copy(pos);
    worldGroup.add(cloud);
  }

  // Edge towers / spires
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const dist = 25 + rng() * 18;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (tooClose(pos, placedPositions, 8)) continue;
    const h = (8 + rng() * 18) * sm;
    const w = (2 + rng() * 3) * sm;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    tower.position.set(pos.x, h / 2, pos.z);
    tower.castShadow = true;
    worldGroup.add(tower);
    placedPositions.push(pos);
  }

  // Distant skyline silhouettes
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 + (rng() - 0.5) * 0.2;
    const dist = 70 + rng() * 40;
    const h = (10 + rng() * 30) * sm;
    const w = (3 + rng() * 5) * sm;
    const sil = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, w),
      new THREE.MeshBasicMaterial({ color: 0x1a2030, fog: true })
    );
    sil.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
    worldGroup.add(sil);
  }

  // Hanging fragments / supports
  for (let i = 0; i < 5; i++) {
    const pos = new THREE.Vector3((rng() - 0.5) * 40, -(3 + rng() * 8), (rng() - 0.5) * 40);
    const s = (1 + rng() * 2.5) * sm;
    const frag = new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), mat);
    frag.position.copy(pos);
    frag.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    frag.userData.floating = true;
    floatingGroups.push({ group: frag as unknown as THREE.Group, baseY: pos.y, phase: rng() * Math.PI * 2 });
    worldGroup.add(frag);
  }

  // Side buildings filling gaps
  for (let i = 0; i < 10; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 10 + rng() * 30;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (tooClose(pos, placedPositions, 6)) continue;
    const h = (3 + rng() * 10) * sm;
    const w = (2 + rng() * 3) * sm;
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    building.position.set(pos.x, h / 2, pos.z);
    building.castShadow = true;
    worldGroup.add(building);
    placedPositions.push(pos);
  }
}

function buildOceanRealm(
  rng: () => number,
  _semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup) return;
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a6570, roughness: 0.85 });

  // Islands / pillars / rock formations near shore
  for (let i = 0; i < 8; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 30 + rng() * 50;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (tooClose(pos, placedPositions, 10)) continue;
    const h = (3 + rng() * 10) * sm;
    const r = (2 + rng() * 4) * sm;
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r, h, 8), rockMat);
    rock.position.set(pos.x, h / 2, pos.z);
    rock.castShadow = true;
    worldGroup.add(rock);
    placedPositions.push(pos);
  }

  // Distant horizon silhouettes: towers / ruins
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const dist = 120 + rng() * 80;
    const h = (10 + rng() * 25) * sm;
    const sil = new THREE.Mesh(
      new THREE.BoxGeometry(3 * sm, h, 3 * sm),
      new THREE.MeshBasicMaterial({ color: 0x1a2530, fog: true })
    );
    sil.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
    worldGroup.add(sil);
  }

  // Scattered rock outcroppings near edges
  for (let i = 0; i < 12; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 15 + rng() * 60;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (tooClose(pos, placedPositions, 5)) continue;
    const r = (1 + rng() * 2.5) * sm;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
    rock.position.set(pos.x, r * 0.3, pos.z);
    rock.rotation.set(rng() * 0.3, rng() * Math.PI, 0);
    rock.castShadow = true;
    worldGroup.add(rock);
  }

  // Shoreline variation: small flat rocks
  for (let i = 0; i < 6; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 8 + rng() * 20;
    const r = (2 + rng() * 3) * sm;
    const flat = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.2, 0.5, 10), rockMat);
    flat.position.set(Math.cos(angle) * dist, 0.15, Math.sin(angle) * dist);
    worldGroup.add(flat);
  }
}

function buildForestRuins(
  rng: () => number,
  _semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup) return;
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1a4a2a, roughness: 0.7 });
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.85 });

  // Dense tree clusters (3 clusters of 6-10 trees)
  for (let cluster = 0; cluster < 3; cluster++) {
    const cx = (rng() - 0.5) * 60;
    const cz = (rng() - 0.5) * 60;
    const count = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i++) {
      const trunkH = (5 + rng() * 7) * sm;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2 * sm, 0.3 * sm, trunkH, 7),
        trunkMat
      );
      const tx = cx + (rng() - 0.5) * 18;
      const tz = cz + (rng() - 0.5) * 18;
      trunk.position.set(tx, trunkH / 2, tz);
      trunk.castShadow = true;
      worldGroup.add(trunk);
      const crownR = (2.5 + rng() * 3) * sm;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(crownR, 8, 8), leafMat);
      crown.position.set(tx, trunkH + crownR * 0.5, tz);
      crown.castShadow = true;
      worldGroup.add(crown);
    }
  }

  // Ruin clusters: broken columns / monuments
  for (let cluster = 0; cluster < 2; cluster++) {
    const cx = (rng() - 0.5) * 40;
    const cz = (rng() - 0.5) * 40;
    const count = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const h = (2 + rng() * 5) * sm;
      const w = (1 + rng() * 1.5) * sm;
      const ruin = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), ruinMat);
      ruin.position.set(cx + (rng() - 0.5) * 15, h / 2, cz + (rng() - 0.5) * 15);
      ruin.rotation.y = rng() * Math.PI;
      ruin.rotation.z = (rng() - 0.5) * 0.25;
      ruin.castShadow = true;
      worldGroup.add(ruin);
    }
    // Broken columns
    for (let i = 0; i < 3; i++) {
      const h = (3 + rng() * 6) * sm;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * sm, 0.6 * sm, h, 8), ruinMat);
      col.position.set(cx + (rng() - 0.5) * 12, h / 2, cz + (rng() - 0.5) * 12);
      col.rotation.z = (rng() - 0.5) * 0.3;
      col.castShadow = true;
      worldGroup.add(col);
    }
  }

  // Open clearings: grass patches
  for (let i = 0; i < 3; i++) {
    const r = (4 + rng() * 5) * sm;
    const clearing = new THREE.Mesh(
      new THREE.CircleGeometry(r, 16),
      new THREE.MeshStandardMaterial({ color: 0x3a6a30, roughness: 0.9, side: THREE.DoubleSide })
    );
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.set((rng() - 0.5) * 40, 0.03, (rng() - 0.5) * 40);
    worldGroup.add(clearing);
  }

  // Background tree silhouettes
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const dist = 80 + rng() * 60;
    const h = (15 + rng() * 20) * sm;
    const sil = new THREE.Mesh(
      new THREE.ConeGeometry(6 * sm, h, 6),
      new THREE.MeshBasicMaterial({ color: 0x0a1a0a, fog: true })
    );
    sil.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
    worldGroup.add(sil);
  }

  // 18B: Forest fog pockets — low-lying mist spheres near tree clusters
  const fogPocketCount = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < fogPocketCount; i++) {
    const fogR = (4 + rng() * 6) * sm;
    const fogMat = new THREE.MeshStandardMaterial({
      color: 0xd8eaee,
      transparent: true,
      opacity: 0.06 + rng() * 0.08,
      roughness: 1.0,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const fog = new THREE.Mesh(new THREE.SphereGeometry(fogR, 8, 8), fogMat);
    fog.position.set(
      (rng() - 0.5) * 55,
      0.5 + rng() * 1.5,
      (rng() - 0.5) * 55
    );
    fog.scale.set(1, 0.35, 1); // flat pancake shape hugging ground
    worldGroup.add(fog);
  }
}

function buildStormVoid(
  rng: () => number,
  _semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup) return;
  const debrisMat = new THREE.MeshStandardMaterial({ color: 0x3a4a50, roughness: 0.8 });

  // Floating debris clusters
  for (let cluster = 0; cluster < 4; cluster++) {
    const cx = (rng() - 0.5) * 60;
    const cy = 8 + rng() * 25;
    const cz = (rng() - 0.5) * 60;
    const count = 4 + Math.floor(rng() * 5);
    const grp = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const s = (0.5 + rng() * 2) * sm;
      const frag = new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), debrisMat);
      frag.position.set((rng() - 0.5) * 8, (rng() - 0.5) * 4, (rng() - 0.5) * 8);
      frag.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      frag.castShadow = true;
      grp.add(frag);
    }
    grp.position.set(cx, cy, cz);
    grp.userData.floating = true;
    floatingGroups.push({ group: grp, baseY: cy, phase: rng() * Math.PI * 2 });
    worldGroup.add(grp);
  }

  // Broken structures
  for (let i = 0; i < 5; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 20 + rng() * 40;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (tooClose(pos, placedPositions, 8)) continue;
    const h = (4 + rng() * 10) * sm;
    const w = (1.5 + rng() * 3) * sm;
    const structure = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.4), debrisMat);
    structure.position.set(pos.x, h / 2, pos.z);
    structure.rotation.z = (rng() - 0.5) * 0.3;
    structure.rotation.x = (rng() - 0.5) * 0.15;
    structure.castShadow = true;
    worldGroup.add(structure);
    placedPositions.push(pos);
  }

  // Dark atmospheric particles
  for (let i = 0; i < 8; i++) {
    const sparkMat = new THREE.MeshStandardMaterial({
      color: 0x4a6a8a, emissive: new THREE.Color(0x2a4a6a),
      emissiveIntensity: 0.4, roughness: 0.3
    });
    const r = (0.15 + rng() * 0.3) * sm;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), sparkMat);
    spark.position.set((rng() - 0.5) * 50, 3 + rng() * 15, (rng() - 0.5) * 50);
    worldGroup.add(spark);
  }
}

function buildSurrealDesert(
  rng: () => number,
  _semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup) return;
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xc8a860, roughness: 0.95 });

  // Dense dune fields
  for (let i = 0; i < 10; i++) {
    const r = (5 + rng() * 12) * sm;
    const dune = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6), sandMat);
    dune.scale.y = 0.2 + rng() * 0.1;
    dune.position.set((rng() - 0.5) * 80, 0, (rng() - 0.5) * 80);
    worldGroup.add(dune);
  }

  // Rock pillars / monoliths
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8a7560, roughness: 0.85 });
  for (let i = 0; i < 6; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 20 + rng() * 40;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (tooClose(pos, placedPositions, 8)) continue;
    const h = (5 + rng() * 14) * sm;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1 * sm, 1.5 * sm, h, 8), pillarMat);
    pillar.position.set(pos.x, h / 2, pos.z);
    pillar.castShadow = true;
    worldGroup.add(pillar);
    placedPositions.push(pos);
  }

  // Floating surreal fragments
  const fragMat = new THREE.MeshStandardMaterial({
    color: 0x8a6aa0, roughness: 0.2,
    emissive: new THREE.Color(0x4a2a6a), emissiveIntensity: 0.3,
    transparent: true, opacity: 0.6
  });
  for (let i = 0; i < 5; i++) {
    const s = (1.5 + rng() * 3) * sm;
    const shape = rng() < 0.5
      ? new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), fragMat)
      : new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), fragMat);
    const y = 6 + rng() * 15;
    shape.position.set((rng() - 0.5) * 50, y, (rng() - 0.5) * 50);
    shape.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    shape.userData.floating = true;
    floatingGroups.push({ group: shape as unknown as THREE.Group, baseY: y, phase: rng() * Math.PI * 2 });
    worldGroup.add(shape);
  }

  // Mirrored duplicate objects (surreal feel)
  for (let i = 0; i < 3; i++) {
    const h = (2 + rng() * 6) * sm;
    const w = (1 + rng() * 2) * sm;
    const obj = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), pillarMat);
    const x = (rng() - 0.5) * 40;
    const z = (rng() - 0.5) * 40;
    obj.position.set(x, h / 2, z);
    obj.castShadow = true;
    worldGroup.add(obj);
    // Mirror copy
    const mirror = obj.clone();
    mirror.position.set(-x, h / 2, -z);
    mirror.rotation.y = Math.PI;
    worldGroup.add(mirror);
  }
}

function buildCastleSky(
  rng: () => number,
  _semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup) return;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b6259, roughness: 0.8, metalness: 0.1 });
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xe0e4ea, roughness: 0.85, transparent: true, opacity: 0.55 });

  // Supporting cloud shelves beneath castle
  for (let i = 0; i < 5; i++) {
    const r = (10 + rng() * 15) * sm;
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cloudMat);
    cloud.scale.y = 0.1 + rng() * 0.08;
    cloud.position.set((rng() - 0.5) * 40, -3 + rng() * 3, (rng() - 0.5) * 40);
    worldGroup.add(cloud);
  }

  // Surrounding towers / turrets
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const dist = 20 + rng() * 15;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (tooClose(pos, placedPositions, 8)) continue;
    const h = (10 + rng() * 14) * sm;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * sm, 2 * sm, h, 10), wallMat);
    tower.position.set(pos.x, h / 2, pos.z);
    tower.castShadow = true;
    worldGroup.add(tower);
    placedPositions.push(pos);
  }

  // Wall segments connecting towers
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const dist = 18;
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const h = (6 + rng() * 4) * sm;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8 * sm, h, 1 * sm), wallMat);
    wall.position.set(cx, h / 2, cz);
    wall.rotation.y = angle + Math.PI / 2;
    wall.castShadow = true;
    worldGroup.add(wall);
  }

  // Distant spires silhouettes
  for (let i = 0; i < 6; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 80 + rng() * 60;
    const h = (15 + rng() * 30) * sm;
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5 * sm, 3 * sm, h, 8),
      new THREE.MeshBasicMaterial({ color: 0x1a1e28, fog: true })
    );
    spire.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
    worldGroup.add(spire);
  }

  // Suspended fragments
  for (let i = 0; i < 4; i++) {
    const s = (1 + rng() * 2) * sm;
    const frag = new THREE.Mesh(
      new THREE.TetrahedronGeometry(s, 0),
      new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.7 })
    );
    const y = -(2 + rng() * 6);
    frag.position.set((rng() - 0.5) * 30, y, (rng() - 0.5) * 30);
    frag.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    frag.userData.floating = true;
    floatingGroups.push({ group: frag as unknown as THREE.Group, baseY: y, phase: rng() * Math.PI * 2 });
    worldGroup.add(frag);
  }
}

function buildDreamZone(
  rng: () => number,
  semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number,
  dreamProfile?: DreamProfile
): void {
  if (!worldGroup) return;

  const accent = paletteAccent(dreamProfile?.palette);
  const emissive = paletteEmissive(dreamProfile?.palette);

  // Central landmark (if nothing else was placed centrally)
  if (!tooClose(new THREE.Vector3(0, 0, 0), placedPositions, 8)) {
    const glowMat = new THREE.MeshStandardMaterial({
      color: accent, roughness: 0.2,
      emissive: new THREE.Color(emissive), emissiveIntensity: 0.4,
      transparent: true, opacity: 0.7
    });
    const s = (3 + rng() * 4) * sm;
    const landmark = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), glowMat);
    landmark.position.set(0, s + 2, 0);
    landmark.userData.floating = true;
    floatingGroups.push({ group: landmark as unknown as THREE.Group, baseY: s + 2, phase: 0 });
    landmark.userData.interactionTag = "landmark";
    worldGroup.add(landmark);
  }

  // Surrounding fragments — repeated motifs (15D: palette-tinted)
  const fragMat = new THREE.MeshStandardMaterial({
    color: 0x8a8580, roughness: 0.7,
    emissive: new THREE.Color(emissive), emissiveIntensity: 0.15
  });
  const fragCount = dreamProfile?.layout === "scattered" ? 16 : 12;
  for (let i = 0; i < fragCount; i++) {
    const angle = (i / fragCount) * Math.PI * 2;
    const dist = 15 + rng() * 25;
    const s = (0.8 + rng() * 1.5) * sm;
    const frag = new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), fragMat);
    const y = 1 + rng() * 6;
    frag.position.set(Math.cos(angle) * dist, y, Math.sin(angle) * dist);
    frag.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    frag.userData.floating = true;
    floatingGroups.push({ group: frag as unknown as THREE.Group, baseY: y, phase: rng() * Math.PI * 2 });
    worldGroup.add(frag);
  }

  // 15D: Tone-reactive ground features
  const formMat = new THREE.MeshStandardMaterial({ color: 0x4a5060, roughness: 0.6 });
  const formCount = dreamProfile?.tone === "wonder" || dreamProfile?.tone === "awe" ? 8 : 6;
  for (let i = 0; i < formCount; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 10 + rng() * 30;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (tooClose(pos, placedPositions, 6)) continue;
    const h = (2 + rng() * 5) * sm;
    const w = (1 + rng() * 2) * sm;
    const form = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), formMat);
    form.position.set(pos.x, h / 2, pos.z);
    form.rotation.y = rng() * Math.PI;
    form.castShadow = true;
    worldGroup.add(form);
    placedPositions.push(pos);
  }
}

// ── 14B-D: Dream Composition Rules ───────────────────────────────────

function applyCompositionRules(
  rng: () => number,
  world: WorldModel,
  groupById: GroupMap,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup) return;
  const names = new Set(world.entities.map((e) => e.attributes.name));
  const descriptors = new Set(
    world.entities.filter((e) => e.type === "descriptor").map((e) => e.attributes.name)
  );

  // "above" should create real layered composition
  if (world.relationships.some((r) => r.type === "above")) {
    // Add visual layering connectors between levels
    world.relationships.forEach((r) => {
      if (r.type !== "above") return;
      const fromGroup = groupById.get(r.from);
      const toGroup = groupById.get(r.to);
      if (!fromGroup || !toGroup) return;
      // Add connecting fragments between the two
      const fromPos = fromGroup.getWorldPosition(new THREE.Vector3());
      const toPos = toGroup.getWorldPosition(new THREE.Vector3());
      const midY = (fromPos.y + toPos.y) / 2;
      const fragMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.7 });
      for (let i = 0; i < 3; i++) {
        const s = (0.5 + rng() * 1) * sm;
        const frag = new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), fragMat);
        const y = midY + (rng() - 0.5) * (fromPos.y - toPos.y) * 0.4;
        frag.position.set(
          (fromPos.x + toPos.x) / 2 + (rng() - 0.5) * 10,
          y,
          (fromPos.z + toPos.z) / 2 + (rng() - 0.5) * 10
        );
        frag.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
        frag.userData.floating = true;
        floatingGroups.push({ group: frag as unknown as THREE.Group, baseY: y, phase: rng() * Math.PI * 2 });
        worldGroup.add(frag);
      }
    });
  }

  // "giant" / "massive" — increase spacing and add scale-emphasizing smaller objects nearby
  if (descriptors.has("giant") || descriptors.has("massive")) {
    for (let i = 0; i < 6; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = 15 + rng() * 30;
      const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      if (tooClose(pos, placedPositions, 4)) continue;
      // Tiny comparison objects
      const h = (0.5 + rng() * 1.5) * sm * 0.4;
      const w = (0.3 + rng() * 0.8) * sm * 0.4;
      const tiny = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, w),
        new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 0.8 })
      );
      tiny.position.set(pos.x, h / 2, pos.z);
      tiny.castShadow = true;
      worldGroup.add(tiny);
    }
  }

  // "endless" — increase horizon population
  if (descriptors.has("endless")) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2 + (rng() - 0.5) * 0.2;
      const dist = 150 + rng() * 150;
      const h = (8 + rng() * 25) * sm;
      const sil = new THREE.Mesh(
        new THREE.BoxGeometry(4 * sm, h, 4 * sm),
        new THREE.MeshBasicMaterial({ color: 0x1a1e28, fog: true })
      );
      sil.position.set(Math.cos(angle) * dist, h / 2, Math.sin(angle) * dist);
      worldGroup.add(sil);
    }
  }

  // "glowing" — emissive accents in multiple places
  if (descriptors.has("bright") || names.has("bright")) {
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff, emissive: new THREE.Color(0x4488aa),
      emissiveIntensity: 0.5, roughness: 0.2, transparent: true, opacity: 0.6
    });
    for (let i = 0; i < 8; i++) {
      const r = (0.2 + rng() * 0.5) * sm;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), glowMat);
      const y = 1 + rng() * 8;
      orb.position.set((rng() - 0.5) * 60, y, (rng() - 0.5) * 60);
      worldGroup.add(orb);
    }
  }

  // "ruined" / "broken" — partial structures and debris
  if (descriptors.has("ruined") || descriptors.has("shattered") || names.has("ruins")) {
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = 10 + rng() * 40;
      const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      if (tooClose(pos, placedPositions, 5)) continue;
      const h = (1 + rng() * 3) * sm;
      const w = (0.5 + rng() * 1.5) * sm;
      const debris = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), debrisMat);
      debris.position.set(pos.x, h / 2, pos.z);
      debris.rotation.z = (rng() - 0.5) * 0.4;
      debris.rotation.y = rng() * Math.PI;
      debris.castShadow = true;
      worldGroup.add(debris);
    }
  }

  // "ancient" — weathering / repeated ruin motifs
  if (descriptors.has("ancient") || descriptors.has("forgotten")) {
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x6a6560, roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = 15 + rng() * 35;
      const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      if (tooClose(pos, placedPositions, 5)) continue;
      const h = (2 + rng() * 4) * sm;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * sm, 0.6 * sm, h, 8), darkMat);
      col.position.set(pos.x, h / 2, pos.z);
      col.rotation.z = (rng() - 0.5) * 0.15;
      col.castShadow = true;
      worldGroup.add(col);
    }
  }

  // "surreal" / "dreamlike" — impossible compositions
  if (descriptors.has("surreal") || descriptors.has("inverted") || descriptors.has("mirrored")) {
    const surrMat = new THREE.MeshStandardMaterial({
      color: 0x8a6aa0, roughness: 0.2, emissive: new THREE.Color(0x4a2a6a),
      emissiveIntensity: 0.3, transparent: true, opacity: 0.6
    });
    // Floating fragments
    for (let i = 0; i < 4; i++) {
      const s = (1 + rng() * 2.5) * sm;
      const y = 5 + rng() * 15;
      const shape = new THREE.Mesh(
        rng() < 0.5 ? new THREE.OctahedronGeometry(s, 0) : new THREE.TetrahedronGeometry(s, 0),
        surrMat
      );
      shape.position.set((rng() - 0.5) * 40, y, (rng() - 0.5) * 40);
      shape.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      shape.userData.floating = true;
      floatingGroups.push({ group: shape as unknown as THREE.Group, baseY: y, phase: rng() * Math.PI * 2 });
      worldGroup.add(shape);
    }
    // Mirrored clusters
    for (let i = 0; i < 2; i++) {
      const h = (3 + rng() * 5) * sm;
      const w = (1 + rng() * 2) * sm;
      const obj = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), surrMat);
      const x = 10 + rng() * 20;
      const z = (rng() - 0.5) * 20;
      obj.position.set(x, h / 2, z);
      worldGroup.add(obj);
      // Offset reflected form
      const reflected = obj.clone();
      reflected.position.set(-x + (rng() - 0.5) * 4, h / 2 + (rng() - 0.5) * 2, -z + (rng() - 0.5) * 4);
      reflected.rotation.y = Math.PI;
      worldGroup.add(reflected);
    }
  }
}

// ── 14B-F: Landmark and Path Logic ───────────────────────────────────

function placeLandmarksAndPaths(
  rng: () => number,
  archetype: EnvironmentArchetype,
  semantics: SemanticTags,
  placedPositions: THREE.Vector3[],
  sm: number
): void {
  if (!worldGroup) return;

  // Secondary landmarks visible from spawn (placed ~30-60 units out)
  const numSecondary = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < numSecondary; i++) {
    const angle = (i / numSecondary) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const dist = 30 + rng() * 30;
    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    if (tooClose(pos, placedPositions, SCALE.minSpacing)) continue;

    const landmark = createSecondaryLandmark(rng, archetype, sm);
    landmark.position.copy(pos);
    landmark.userData.interactionTag = "landmark";
    landmark.traverse((child: THREE.Object3D) => { child.userData.interactionTag = "landmark"; });
    worldGroup.add(landmark);
    placedPositions.push(pos);
  }

  // Visual path: loose trail of small objects from center outward
  const pathAngle = rng() * Math.PI * 2;
  const pathLength = 6 + Math.floor(rng() * 4);
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x6a6a70, roughness: 0.85 });
  for (let i = 0; i < pathLength; i++) {
    const dist = 8 + i * (6 + rng() * 3);
    const jitterX = (rng() - 0.5) * 3;
    const jitterZ = (rng() - 0.5) * 3;
    const px = Math.cos(pathAngle) * dist + jitterX;
    const pz = Math.sin(pathAngle) * dist + jitterZ;
    const r = (0.3 + rng() * 0.6) * sm;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), pathMat);
    stone.position.set(px, r * 0.3, pz);
    stone.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    worldGroup.add(stone);
  }
}

function createSecondaryLandmark(
  rng: () => number,
  archetype: EnvironmentArchetype,
  sm: number
): THREE.Group {
  const group = new THREE.Group();

  if (archetype === "floating_city" || archetype === "castle_sky") {
    // Spire or small tower
    const h = (8 + rng() * 12) * sm;
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.5, metalness: 0.15 });
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * sm, 1.5 * sm, h, 8), mat);
    spire.position.y = h / 2;
    spire.castShadow = true;
    group.add(spire);
    // Top ornament
    const top = new THREE.Mesh(
      new THREE.OctahedronGeometry(1 * sm, 0),
      new THREE.MeshStandardMaterial({ color: 0x88aacc, emissive: new THREE.Color(0x4466aa), emissiveIntensity: 0.3 })
    );
    top.position.y = h + 1;
    group.add(top);
  } else if (archetype === "ocean_realm") {
    // Rock pillar with beacon
    const h = (6 + rng() * 10) * sm;
    const rock = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5 * sm, 2.5 * sm, h, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a6570, roughness: 0.85 })
    );
    rock.position.y = h / 2;
    rock.castShadow = true;
    group.add(rock);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.6 * sm, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffee88, emissive: new THREE.Color(0xffdd44), emissiveIntensity: 0.6 })
    );
    beacon.position.y = h + 1;
    group.add(beacon);
  } else if (archetype === "forest_ruins") {
    // Broken monument
    const h = (4 + rng() * 6) * sm;
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a7568, roughness: 0.85 });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * sm, 0.7 * sm, h, 10), mat);
    col.position.y = h / 2;
    col.rotation.z = (rng() - 0.5) * 0.15;
    col.castShadow = true;
    group.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5 * sm, 0.5 * sm, 1.5 * sm), mat);
    cap.position.y = h;
    group.add(cap);
  } else if (archetype === "storm_void") {
    // Floating broken sphere
    const s = (2 + rng() * 3) * sm;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a5a6a, emissive: new THREE.Color(0x2a3a4a),
      emissiveIntensity: 0.3, roughness: 0.4
    });
    const sphere = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat);
    sphere.position.y = 5 + rng() * 10;
    sphere.userData.floating = true;
    group.add(sphere);
  } else {
    // Default: glowing obelisk
    const h = (5 + rng() * 8) * sm;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6a7aaa, roughness: 0.3,
      emissive: new THREE.Color(0x3a4a6a), emissiveIntensity: 0.25
    });
    const obelisk = new THREE.Mesh(new THREE.BoxGeometry(1 * sm, h, 1 * sm), mat);
    obelisk.position.y = h / 2;
    obelisk.castShadow = true;
    group.add(obelisk);
  }

  return group;
}

// ── 14B-G: Background Population ─────────────────────────────────────

function populateBackground(
  rng: () => number,
  archetype: EnvironmentArchetype,
  semantics: SemanticTags,
  sm: number
): void {
  if (!worldGroup) return;

  const count = 14 + Math.floor(rng() * 8);

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    const dist = 180 + rng() * 220;

    const bgGroup = createDistantForm(rng, archetype, sm);
    bgGroup.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    worldGroup.add(bgGroup);
  }

  // Far cloud bands (always, for sky scale)
  for (let i = 0; i < 6; i++) {
    const r = (20 + rng() * 40) * sm;
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0x3a3e4a, fog: true, transparent: true, opacity: 0.25
    });
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), cloudMat);
    cloud.scale.y = 0.08;
    cloud.position.set(
      (rng() - 0.5) * 400,
      30 + rng() * 40,
      (rng() - 0.5) * 400
    );
    worldGroup.add(cloud);
  }
}

function createDistantForm(
  rng: () => number,
  archetype: EnvironmentArchetype,
  sm: number
): THREE.Group {
  const group = new THREE.Group();
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x1a1e28, fog: true });

  if (archetype === "floating_city") {
    // Distant city silhouettes
    const count = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i++) {
      const w = (3 + rng() * 5) * sm;
      const h = (10 + rng() * 35) * sm;
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), darkMat);
      building.position.set((rng() - 0.5) * 40, h / 2, (rng() - 0.5) * 20);
      group.add(building);
    }
  } else if (archetype === "ocean_realm") {
    // Distant islands / towers
    const roll = rng();
    if (roll < 0.5) {
      const h = (5 + rng() * 15) * sm;
      const r = (4 + rng() * 8) * sm;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), darkMat);
      rock.position.y = h / 2;
      group.add(rock);
    } else {
      const h = (15 + rng() * 30) * sm;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * sm, 3 * sm, h, 8), darkMat);
      tower.position.y = h / 2;
      group.add(tower);
    }
  } else if (archetype === "forest_ruins") {
    // Distant tree lines + ruin outlines
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const h = (12 + rng() * 20) * sm;
      const tree = new THREE.Mesh(new THREE.ConeGeometry(5 * sm, h, 6), new THREE.MeshBasicMaterial({ color: 0x0a1a0a, fog: true }));
      tree.position.set((rng() - 0.5) * 30, h / 2, (rng() - 0.5) * 15);
      group.add(tree);
    }
    if (rng() < 0.5) {
      const h = (6 + rng() * 10) * sm;
      const w = (2 + rng() * 4) * sm;
      const ruin = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), darkMat);
      ruin.position.set((rng() - 0.5) * 20, h / 2, (rng() - 0.5) * 10);
      ruin.rotation.z = (rng() - 0.5) * 0.1;
      group.add(ruin);
    }
  } else if (archetype === "storm_void") {
    // Sparse dark shapes
    const h = (8 + rng() * 20) * sm;
    const shape = rng() < 0.5
      ? new THREE.Mesh(new THREE.ConeGeometry(4 * sm, h, 6), darkMat)
      : new THREE.Mesh(new THREE.BoxGeometry(3 * sm, h, 3 * sm), darkMat);
    shape.position.y = h / 2;
    group.add(shape);
  } else if (archetype === "surreal_desert") {
    // Mirrored distant monoliths
    const h = (10 + rng() * 25) * sm;
    const w = (2 + rng() * 4) * sm;
    const monolith = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.4), darkMat);
    monolith.position.y = h / 2;
    group.add(monolith);
    // Ghost duplicate
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, w * 0.4),
      new THREE.MeshBasicMaterial({ color: 0x1a1030, fog: true, transparent: true, opacity: 0.4 })
    );
    ghost.position.set((rng() - 0.5) * 20, h / 2, (rng() - 0.5) * 10);
    ghost.rotation.y = Math.PI;
    group.add(ghost);
  } else if (archetype === "castle_sky") {
    // Distant towers and mountain peaks
    const roll = rng();
    if (roll < 0.5) {
      const h = (20 + rng() * 40) * sm;
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * sm, 3 * sm, h, 8), darkMat);
      spire.position.y = h / 2;
      group.add(spire);
    } else {
      const h = (25 + rng() * 40) * sm;
      const r = (10 + rng() * 15) * sm;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), darkMat);
      mountain.position.y = h / 2;
      group.add(mountain);
    }
  } else {
    // dream_zone: abstract distant forms
    const s = (6 + rng() * 15) * sm;
    const shape = rng() < 0.5
      ? new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), new THREE.MeshBasicMaterial({ color: 0x1a1030, fog: true, transparent: true, opacity: 0.5 }))
      : new THREE.Mesh(new THREE.ConeGeometry(s * 0.6, s * 2, 6), darkMat);
    shape.position.y = s;
    group.add(shape);
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

// ── 16B: Session variation counter — same dream varies slightly on re-gen ────
let sessionVariation = 0;
let variationEnabled = true; // 18H: Toggle for stable vs varied dreams

export function setVariationEnabled(enabled: boolean): void {
  variationEnabled = enabled;
}
export function getVariationEnabled(): boolean {
  return variationEnabled;
}

function seededRandom(text: string): () => number {
  let hash = 2166136261;
  // Mix session variation so the same dream text produces different placement
  const salted = variationEnabled ? text + "|v" + sessionVariation : text;
  for (let i = 0; i < salted.length; i += 1) {
    hash ^= salted.charCodeAt(i);
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
  const scene = world.sceneType ?? "generic";

  const stormCues = ["storm", "stormy", "thunder"];
  // 17G: Narrowed surreal triggers — only explicit surreal keywords, not mood
  const surrealCues = ["surreal", "kaleidoscopic", "inverted", "mirrored", "prismatic"];
  const nightCues = ["moon", "stars", "night", "space", "dark", "starry"];
  const sunsetCues = ["sunset", "dusk", "purple", "golden"];
  const rainCues = ["rain", "rainy"];
  const snowCues = ["snow", "snowy", "frozen"];

  let mode: SkyMode = "day";
  const weather: string[] = [];
  const celestial: string[] = [];

  // 17G: Scene-type-driven sky defaults (applied BEFORE cue overrides)
  switch (scene) {
    case "beach": mode = Math.random() < 0.5 ? "day" : "sunset"; break;
    case "cave": mode = "night"; break;
    case "ocean": mode = Math.random() < 0.4 ? "sunset" : "day"; break;
    case "frozen": mode = Math.random() < 0.3 ? "storm" : "day"; break;
    case "desert": mode = Math.random() < 0.4 ? "sunset" : "day"; break;
    case "surreal": mode = "surreal"; break;
    case "forest": mode = "day"; break;
    case "city": mode = Math.random() < 0.3 ? "night" : Math.random() < 0.5 ? "sunset" : "day"; break;
    default: break; // "day" baseline
  }

  // Explicit cues can override scene defaults
  if (stormCues.some((c) => names.has(c)) || sem.weather === "storm") {
    mode = "storm";
    weather.push("rain", "thunder");
  } else if (surrealCues.some((c) => names.has(c)) || sem.surreality === "extreme") {
    mode = "surreal";
    celestial.push("stars");
  } else if (nightCues.some((c) => names.has(c)) || sem.time === "night") {
    mode = "night";
    celestial.push("stars", "moon");
  } else if (sunsetCues.some((c) => names.has(c)) || sem.time === "sunset") {
    mode = "sunset";
    celestial.push("sun");
  } else {
    // Keep scene-derived mode; add appropriate celestial bodies
    if (mode === "night") {
      celestial.push("stars", "moon");
    } else if (mode === "sunset") {
      celestial.push("sun");
    } else if (mode === "surreal") {
      celestial.push("stars");
    } else {
      celestial.push("sun");
    }
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
  // 17G: Scene-aware sky color tinting for variety
  let [skyTop, skyBottom] = SKY_COLORS[profile.mode];
  if (profile.mode === "day") {
    // Vary the day sky per scene type
    switch (activeSceneType) {
      case "beach": skyTop = 0x4a8af0; skyBottom = 0xd0e8ff; break;  // brighter blue
      case "forest": skyTop = 0x2a5a90; skyBottom = 0x8ab8d8; break; // muted green-blue
      case "desert": skyTop = 0x5a8ac0; skyBottom = 0xe8d8b0; break; // warm haze
      case "mountain": skyTop = 0x3070c0; skyBottom = 0xa0c4e8; break; // crisp blue
      case "frozen": skyTop = 0x4a6a90; skyBottom = 0xc8d8e8; break;  // pale cold
    }
  } else if (profile.mode === "sunset") {
    switch (activeSceneType) {
      case "beach": skyTop = 0x1a0830; skyBottom = 0xd08040; break;   // warm golden
      case "desert": skyTop = 0x2a1020; skyBottom = 0xc86030; break;  // deep orange
      case "ocean": skyTop = 0x1a1040; skyBottom = 0xb07050; break;   // dusky purple-orange
    }
  }
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

  // Lighting (base mode values)
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

  // 18G/19I: Scene-specific lighting adjustments (AFTER base mode values)
  switch (activeSceneType) {
    case "cave":
      if (ambientLight) ambientLight.intensity *= 0.55;
      if (directionalLight) directionalLight.intensity *= 0.4;
      if (fillLight) fillLight.intensity *= 0.5;
      break;
    case "beach":
      if (directionalLight) directionalLight.intensity *= 1.15;
      if (fillLight) fillLight.intensity += 0.1;
      break;
    case "temple":
      if (rimLight) { rimLight.color.setHex(0xffcc88); rimLight.intensity = 0.35; }
      break;
    case "frozen":
      if (fillLight) fillLight.color.setHex(0xc0d8f0);
      break;
  }
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

  // 15B: Consistent wind direction per world
  const windAngle = rng() * Math.PI * 2;
  weatherWindDir.set(Math.cos(windAngle), Math.sin(windAngle));
  const hasWind = profile.weather.includes("wind") || profile.weather.includes("thunder") || profile.weather.includes("rain");
  weatherWindStrength = hasWind ? 1.5 + rng() * 2 : 0.3 + rng() * 0.5;
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

// ── 15B: World-scale weather — follows player ──────────────────────

/** Wind direction vector (consistent per world) — set at sky profile time */
let weatherWindDir = new THREE.Vector2(1, 0);
let weatherWindStrength = 0;

function createRainSystem(rng: () => number): THREE.Points {
  // 20B: More particles, wider spread, full vertical coverage (above flight to ground)
  const count = 900;
  const positions = new Float32Array(count * 3);
  const spread = 160;
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rng() - 0.5) * spread;
    positions[i * 3 + 1] = rng() * 70 - 5; // -5 to +65 — covers ground to above flight height
    positions[i * 3 + 2] = (rng() - 0.5) * spread;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xaabbdd,
    size: 0.18,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  return new THREE.Points(geo, mat);
}

function createSnowSystem(rng: () => number): THREE.Points {
  // 20B: More particles, wider spread, full vertical coverage
  const count = 500;
  const positions = new Float32Array(count * 3);
  const spread = 160;
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (rng() - 0.5) * spread;
    positions[i * 3 + 1] = rng() * 60 - 3; // -3 to +57 — snow touches ground
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
  // 20B: Weather covers full scene — wide spread matched to init spread
  const halfSpread = 80;

  // ── Rain: follows player, driven by wind ──────────────────────────
  if (weatherRain) {
    weatherRain.position.set(playerPos.x, 0, playerPos.z);
    const pos = weatherRain.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i += 1) {
      arr[i * 3 + 1] -= dt * 16; // slightly faster fall for visibility
      // Wind drift
      arr[i * 3]     += weatherWindDir.x * weatherWindStrength * dt * 3;
      arr[i * 3 + 2] += weatherWindDir.y * weatherWindStrength * dt * 3;
      // 20B: Rain reaches ground (y = groundBaseY - 2) then recycles high
      if (arr[i * 3 + 1] < groundBaseY - 2) {
        // 20B: Spawn splash ring at impact point
        if (scene && rainSplashes.length < RAIN_SPLASH_MAX && Math.random() < 0.15) {
          const splash = new THREE.Mesh(rainSplashGeo, rainSplashMat.clone());
          splash.rotation.x = -Math.PI / 2;
          const wx = playerPos.x + arr[i * 3];
          const wz = playerPos.z + arr[i * 3 + 2];
          splash.position.set(wx, groundBaseY + 0.05, wz);
          splash.scale.set(0.5, 0.5, 0.5);
          scene.add(splash);
          rainSplashes.push({ mesh: splash, timer: 0.35 });
        }
        arr[i * 3 + 1] = 55 + Math.random() * 15;
        // Redistribute horizontally on recycle for even coverage
        arr[i * 3] = (Math.random() - 0.5) * halfSpread * 2;
        arr[i * 3 + 2] = (Math.random() - 0.5) * halfSpread * 2;
      }
      // Wrap horizontally around player
      if (arr[i * 3] > halfSpread) arr[i * 3] -= halfSpread * 2;
      if (arr[i * 3] < -halfSpread) arr[i * 3] += halfSpread * 2;
      if (arr[i * 3 + 2] > halfSpread) arr[i * 3 + 2] -= halfSpread * 2;
      if (arr[i * 3 + 2] < -halfSpread) arr[i * 3 + 2] += halfSpread * 2;
    }
    pos.needsUpdate = true;

    // 20B: Update rain splashes — expand and fade
    for (let si = rainSplashes.length - 1; si >= 0; si--) {
      const sp = rainSplashes[si];
      sp.timer -= dt;
      const progress = 1 - sp.timer / 0.35;
      sp.mesh.scale.setScalar(0.5 + progress * 1.5);
      (sp.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - progress);
      if (sp.timer <= 0) {
        sp.mesh.parent?.remove(sp.mesh);
        (sp.mesh.material as THREE.Material).dispose();
        rainSplashes.splice(si, 1);
      }
    }
  }

  // ── Snow: follows player, gentle wind + sine sway ─────────────────
  if (weatherSnow) {
    weatherSnow.position.set(playerPos.x, 0, playerPos.z);
    const pos = weatherSnow.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const time = performance.now() / 1000;
    // 16F: Snow gust — periodic faster fall + stronger horizontal drift
    const gustMult = snowGustActive ? 3.0 : 1.0;
    const gustHoriz = snowGustActive ? 2.5 : 1.0;
    for (let i = 0; i < pos.count; i += 1) {
      arr[i * 3 + 1] -= dt * 1.5 * gustMult;
      arr[i * 3] += (Math.sin(time + i * 0.5) * dt * 0.5 + weatherWindDir.x * weatherWindStrength * dt) * gustHoriz;
      arr[i * 3 + 2] += (Math.cos(time * 0.7 + i * 0.3) * dt * 0.3 + weatherWindDir.y * weatherWindStrength * dt) * gustHoriz;
      // 20B: Snow reaches ground then recycles
      if (arr[i * 3 + 1] < groundBaseY - 1) {
        arr[i * 3 + 1] = 48 + Math.random() * 12;
        arr[i * 3] = (Math.random() - 0.5) * halfSpread * 2;
        arr[i * 3 + 2] = (Math.random() - 0.5) * halfSpread * 2;
      }
      if (arr[i * 3] > halfSpread) arr[i * 3] -= halfSpread * 2;
      if (arr[i * 3] < -halfSpread) arr[i * 3] += halfSpread * 2;
      if (arr[i * 3 + 2] > halfSpread) arr[i * 3 + 2] -= halfSpread * 2;
      if (arr[i * 3 + 2] < -halfSpread) arr[i * 3 + 2] += halfSpread * 2;
    }
    pos.needsUpdate = true;

    // 16F: Snow gust timer
    if (snowGustActive) {
      snowGustTimer -= dt;
      if (snowGustTimer <= 0) { snowGustActive = false; snowGustTimer = 8 + Math.random() * 12; }
    } else {
      snowGustTimer -= dt;
      if (snowGustTimer <= 0) { snowGustActive = true; snowGustTimer = 1.5 + Math.random() * 2; }
    }
  }

  if (thunderActive && directionalLight) {
    thunderTimer -= dt;
    if (thunderTimer <= 0) {
      const base = (directionalLight.userData.baseIntensity as number) ?? 0.5;
      directionalLight.intensity = base * 6;
      setTimeout(() => {
        if (directionalLight) directionalLight.intensity = base;
      }, 100);
      // 16F: Lightning bolt visual — brief glowing line from sky
      if (scene) {
        const boltX = playerPos.x + (Math.random() - 0.5) * 40;
        const boltZ = playerPos.z + (Math.random() - 0.5) * 40;
        const points = [];
        let y = 25;
        const segments = 6 + Math.floor(Math.random() * 4);
        for (let s = 0; s <= segments; s++) {
          points.push(new THREE.Vector3(
            boltX + (Math.random() - 0.5) * 3 * (s / segments),
            y,
            boltZ + (Math.random() - 0.5) * 3 * (s / segments)
          ));
          y -= 25 / segments;
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0xeeeeff, linewidth: 2, transparent: true, opacity: 1 });
        const bolt = new THREE.Line(geo, mat);
        scene.add(bolt);
        if (lightningBolt) { lightningBolt.parent?.remove(lightningBolt); lightningBolt.geometry.dispose(); (lightningBolt.material as THREE.Material).dispose(); }
        lightningBolt = bolt;
        // Fade and remove lightning
        setTimeout(() => { if (bolt.parent) { bolt.parent.remove(bolt); bolt.geometry.dispose(); mat.dispose(); } if (lightningBolt === bolt) lightningBolt = null; }, 200);
      }
      // 16F: Delayed thunder sound
      setTimeout(() => { playThunderSound(); }, 300 + Math.random() * 700);
      thunderTimer = 5 + Math.random() * 10;
    }
  }

  // 16F: Fog density waves — subtle far-plane oscillation
  if (scene && scene.fog instanceof THREE.Fog) {
    fogWaveTimer += dt;
    const wave = Math.sin(fogWaveTimer * 0.15) * 0.12; // ±12% modulation
    scene.fog.far = fogBaseFar * (1 + wave);
  }

  // 16F: Magic particle surge — brief emissive burst for mystical/surreal worlds
  if (activeSemantics && (activeSemantics.mood === "dreamlike" || activeSemantics.mood === "chaotic")) {
    magicSurgeTimer -= dt;
    if (magicSurgeTimer <= 0) {
      magicSurgeTimer = 10 + Math.random() * 15;
      // Briefly boost all ambient/magic particle layers
      for (const layer of particleLayers) {
        if (layer.kind === "ambient" || layer.kind === "magic") {
          const mat = layer.points.material as THREE.PointsMaterial;
          const origOpacity = mat.opacity;
          const origSize = mat.size;
          mat.opacity = Math.min(1, origOpacity * 2.5);
          mat.size = origSize * 1.5;
          setTimeout(() => { mat.opacity = origOpacity; mat.size = origSize; }, 1500);
        }
      }
    }
  }
}

// ── 14D: Particle & Atmosphere System ────────────────────────────────

/** Shared geometries/materials for instanced particles (Section E) */
const PARTICLE_GEO = {
  /** Reused across all point-based layers */
  get sphere(): THREE.SphereGeometry {
    if (!_sGeo) _sGeo = new THREE.SphereGeometry(0.08, 4, 4);
    return _sGeo;
  }
};
let _sGeo: THREE.SphereGeometry | null = null;

function createParticleLayer(
  rng: () => number,
  count: number,
  kind: ParticleLayer["kind"],
  spread: number,
  yRange: [number, number],
  color: number,
  size: number,
  opacity: number,
  baseVelocity: THREE.Vector3,
  followCamera: boolean,
  emissiveIntensity: number
): ParticleLayer {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3]     = (rng() - 0.5) * spread;
    positions[i3 + 1] = yRange[0] + rng() * (yRange[1] - yRange[0]);
    positions[i3 + 2] = (rng() - 0.5) * spread;

    // Per-particle velocity = base + small random jitter
    velocities[i3]     = baseVelocity.x + (rng() - 0.5) * 0.15;
    velocities[i3 + 1] = baseVelocity.y + (rng() - 0.5) * 0.08;
    velocities[i3 + 2] = baseVelocity.z + (rng() - 0.5) * 0.15;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    depthWrite: false,
    ...(emissiveIntensity > 0 ? { emissive: color, emissiveIntensity } : {})
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  return { points, velocities, bounds: spread / 2, kind, followCamera };
}

/**
 * A. Global ambient particles — floating dust/dream motes
 */
function spawnAmbientParticles(rng: () => number): void {
  if (!scene) return;
  const count = 120;
  const layer = createParticleLayer(
    rng, count, "ambient", 50, [0.5, 12], 0xccccdd, 0.18, 0.25,
    new THREE.Vector3(0, 0.12, 0), true, 0.2
  );
  scene.add(layer.points);
  particleLayers.push(layer);
}

/**
 * B. Landmark-specific particles — based on entity semantics
 */
function spawnLandmarkParticles(
  rng: () => number,
  world: WorldModel,
  groupById: GroupMap
): void {
  if (!scene) return;
  const names = new Set(world.entities.map((e) => e.attributes.name));
  const sem = world.semantics;
  let budget = MAX_TOTAL_PARTICLES - particleLayers.reduce((s, l) => s + l.points.geometry.attributes.position.count, 0);

  // Helper: spawn a landmark layer at a specific world position
  const spawnAt = (
    pos: THREE.Vector3,
    count: number,
    kind: ParticleLayer["kind"],
    spread: number,
    yRange: [number, number],
    color: number,
    size: number,
    opacity: number,
    vel: THREE.Vector3,
    emissive: number
  ) => {
    if (budget <= 0) return;
    const n = Math.min(count, budget);
    budget -= n;
    const layer = createParticleLayer(rng, n, kind, spread, yRange, color, size, opacity, vel, false, emissive);
    layer.points.position.copy(pos);
    scene!.add(layer.points);
    particleLayers.push(layer);
  };

  // Detect themes from entity names + semantics
  const hasMagic = ["magical", "enchanted", "mystical", "glowing", "ethereal", "spectral", "luminous"].some((w) => names.has(w)) || sem.mood === "mystical" || sem.mood === "dreamlike";
  const hasLava = ["lava", "burning", "fire", "flame", "magma", "inferno"].some((w) => names.has(w)) || sem.danger === "dangerous";
  const hasWater = ["ocean", "sea", "lake", "river", "water", "rain", "waterfall"].some((w) => names.has(w)) || sem.environment === "ocean" || sem.environment === "coastal";
  const hasForest = ["forest", "jungle", "tree", "grove", "woods"].some((w) => names.has(w)) || sem.environment === "forest";
  const hasCave = ["cave", "crypt", "cavern", "tunnel", "grotto"].some((w) => names.has(w)) || sem.environment === "cave";

  // Try to attach to primary landmark first; fall back to origin
  const primaryEntity = world.primaryLandmarkId ? world.entities.find((e) => e.id === world.primaryLandmarkId) : null;
  const primaryGroup = primaryEntity ? groupById.get(primaryEntity.id) : null;
  const primaryPos = primaryGroup ? primaryGroup.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);

  if (hasMagic) {
    spawnAt(primaryPos, 80, "magic", 18, [0.5, 10], 0x7799ff, 0.22, 0.4,
      new THREE.Vector3(0, 0.2, 0), 0.6);
  }
  if (hasLava) {
    spawnAt(primaryPos, 70, "lava", 16, [0.2, 8], 0xff6622, 0.25, 0.55,
      new THREE.Vector3(0, 0.6, 0), 0.8);
  }
  if (hasWater) {
    spawnAt(primaryPos, 60, "water", 30, [0.1, 2.5], 0x88bbdd, 0.2, 0.3,
      new THREE.Vector3(0.1, 0.04, 0.05), 0.15);
  }
  if (hasForest) {
    spawnAt(primaryPos, 50, "forest", 28, [1, 9], 0x66aa44, 0.3, 0.35,
      new THREE.Vector3(0.3, -0.15, 0.1), 0);
  }
  if (hasCave) {
    spawnAt(primaryPos, 50, "cave", 14, [0.3, 6], 0x887766, 0.15, 0.2,
      new THREE.Vector3(0, 0.06, 0), 0.1);
  }
}

/**
 * C. Sky particles — stars twinkle, cloud drift, dream anomalies
 */
function spawnSkyParticles(rng: () => number, skyMode: SkyMode): void {
  if (!scene) return;
  let budget = MAX_TOTAL_PARTICLES - particleLayers.reduce((s, l) => s + l.points.geometry.attributes.position.count, 0);

  // Dream anomalies — slow-rotating geometric fragments in the upper sky
  if (budget > 0) {
    const count = Math.min(30, budget);
    budget -= count;
    const layer = createParticleLayer(
      rng, count, "anomaly", 80, [25, 55], 0xaabbee, 0.6, 0.2,
      new THREE.Vector3(0.02, 0.01, 0.03), true, 0.3
    );
    scene.add(layer.points);
    particleLayers.push(layer);
  }
}

/**
 * D. Motion system — update all particle layers each frame
 */
function updateParticles(dt: number): void {
  if (dt <= 0 || dt > 0.5) return; // skip on pause or lag spike
  const time = performance.now() / 1000;
  const camPos = camera ? camera.position : new THREE.Vector3();

  for (const layer of particleLayers) {
    const posAttr = layer.points.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const vel = layer.velocities;
    const n = posAttr.count;
    const half = layer.bounds;

    // Follow camera for ambient / sky layers
    if (layer.followCamera && camera) {
      layer.points.position.set(camPos.x, 0, camPos.z);
    }

    for (let i = 0; i < n; i++) {
      const i3 = i * 3;

      // Apply velocity
      arr[i3]     += vel[i3]     * dt;
      arr[i3 + 1] += vel[i3 + 1] * dt;
      arr[i3 + 2] += vel[i3 + 2] * dt;

      // Ambient: gentle sine drift
      if (layer.kind === "ambient") {
        arr[i3]     += Math.sin(time * 0.3 + i * 0.7) * dt * 0.15;
        arr[i3 + 2] += Math.cos(time * 0.25 + i * 1.1) * dt * 0.12;
      }

      // Lava: flicker by oscillating Y velocity
      if (layer.kind === "lava") {
        arr[i3]     += Math.sin(time * 2.5 + i * 3.1) * dt * 0.4;
        arr[i3 + 1] += Math.sin(time * 1.8 + i * 2.3) * dt * 0.3;
      }

      // Forest: sideways drift + occasional fall
      if (layer.kind === "forest") {
        arr[i3] += Math.sin(time * 0.4 + i * 0.9) * dt * 0.2;
      }

      // Anomaly: slow rotation-like wobble
      if (layer.kind === "anomaly") {
        arr[i3]     += Math.sin(time * 0.15 + i * 2.0) * dt * 0.1;
        arr[i3 + 2] += Math.cos(time * 0.12 + i * 1.5) * dt * 0.1;
      }

      // Wrap/reset if out of bounds (seamless looping)
      if (arr[i3] > half) arr[i3] -= half * 2;
      else if (arr[i3] < -half) arr[i3] += half * 2;

      if (arr[i3 + 2] > half) arr[i3 + 2] -= half * 2;
      else if (arr[i3 + 2] < -half) arr[i3 + 2] += half * 2;

      // Y reset: wrap vertically within the layer's range
      if (layer.kind === "lava" || layer.kind === "magic" || layer.kind === "ambient") {
        if (arr[i3 + 1] > 14) arr[i3 + 1] = 0.2;
        if (arr[i3 + 1] < 0) arr[i3 + 1] = 12;
      } else if (layer.kind === "forest") {
        if (arr[i3 + 1] < 0) arr[i3 + 1] = 8 + Math.random() * 2;
      } else if (layer.kind === "anomaly") {
        if (arr[i3 + 1] < 20) arr[i3 + 1] = 50;
        if (arr[i3 + 1] > 60) arr[i3 + 1] = 25;
      }
    }

    posAttr.needsUpdate = true;
  }

  // Star twinkle: pulse existing starfield opacity
  if (starfield && starfield.material instanceof THREE.PointsMaterial) {
    starfield.material.opacity = 0.3 + Math.sin(time * 0.7) * 0.08;
  }

  // Cloud drift: move sky clouds slowly
  if (skyCloudGroup) {
    skyCloudGroup.children.forEach((child: THREE.Object3D, ci: number) => {
      child.position.x += Math.sin(time * 0.04 + ci * 0.8) * dt * 0.15;
      child.position.z += Math.cos(time * 0.03 + ci * 1.2) * dt * 0.1;
    });
  }
}

/**
 * G. Camera sway — subtle micro-movement for dream immersion
 */
function updateCameraSway(dt: number): void {
  if (!camera || !cameraSway.enabled || !controlsEnabled) return;
  cameraSway.phase += dt;
  const t = cameraSway.phase;
  // Very subtle: ~0.15° sway amplitude
  const swayYaw  = Math.sin(t * 0.5)  * 0.0015;
  const swayPitch = Math.sin(t * 0.35) * 0.001;
  yaw   += swayYaw  * dt;
  pitch += swayPitch * dt;
}

// ── 14E+F: Cinematic intro ──────────────────────────────────────────

/** Smooth ease-in-out curve (hermite) */
function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Start a cinematic fly-in from high above the scene down to the player spawn.
 * The camera sweeps in over `duration` seconds, then calls `onComplete`.
 */
export function startCinematicIntro(onComplete?: () => void): void {
  if (!camera) { onComplete?.(); return; }

  // 18A: Cinematic sweep — start from a lateral elevated angle
  //   so the camera sweeps across the scene before settling at player spawn.
  const sideAngle = yaw + Math.PI * 0.55 + (Math.random() < 0.5 ? 1 : -1) * 0.3;
  const startDist = 35 + Math.random() * 20;
  const startHeight = 40 + Math.random() * 18;
  const high = new THREE.Vector3(
    playerPos.x + Math.sin(sideAngle) * startDist,
    startHeight,
    playerPos.z + Math.cos(sideAngle) * startDist
  );

  cinematic.active = true;
  cinematic.startTime = performance.now() / 1000;
  cinematic.duration = 4.5; // 18A: extended from 3 for premium feel
  cinematic.startPos.copy(high);
  // 20A: End at actual player position (elevated if flight-first)
  cinematic.endPos.set(playerPos.x, playerPos.y + PLAYER_EYE_HEIGHT, playerPos.z);
  // 18A: Look toward primary landmark during cinematic sweep so the world reads beautifully
  const landlmarkLook = primaryLandmarkWorldPos ?? new THREE.Vector3(0, 2, 0);
  cinematic.lookTarget.set(landlmarkLook.x, Math.max(landlmarkLook.y, 2), landlmarkLook.z);
  cinematic.onComplete = onComplete ?? null;

  // Position camera at start
  camera.position.copy(high);
  camera.lookAt(cinematic.lookTarget);
}

/**
 * Drive the cinematic animation each frame. Returns true while active.
 */
function updateCinematic(dt: number): boolean {
  if (!cinematic.active || !camera) return false;

  const now = performance.now() / 1000;
  const elapsed = now - cinematic.startTime;
  const rawT = elapsed / cinematic.duration;

  if (rawT >= 1) {
    // Finished — snap to final position
    camera.position.copy(cinematic.endPos);
    camera.lookAt(cinematic.lookTarget);
    syncAnglesToCamera();
    cinematic.active = false;
    cinematic.onComplete?.();
    cinematic.onComplete = null;
    return false;
  }

  const t = smoothstep(rawT);

  // 18A: Interpolate position with a graceful arc
  camera.position.lerpVectors(cinematic.startPos, cinematic.endPos, t);

  // 18A: Arc peaks in the first half, giving a swoop-down feel
  const arc = Math.sin(rawT * Math.PI) * 12;
  camera.position.y += arc * (1 - t * 0.5);

  // 18A: Look target descends gradually from 10 units up to ground
  const lookY = cinematic.lookTarget.y + (1 - t) * 10;
  camera.lookAt(cinematic.lookTarget.x, lookY, cinematic.lookTarget.z);

  return true;
}

export function isCinematicActive(): boolean {
  return cinematic.active;
}

// ── 16G: Demo helpers ────────────────────────────────────────────────

export function resetPlayerPosition(): void {
  playerPos.copy(playerSpawnPos);
  playerVelY = 0;
  // 20A: Keep flight active on reset — flight is default mode
  if (currentPower === "flight") flightActive = true;
  if (camera) {
    camera.position.set(playerPos.x, playerPos.y + PLAYER_EYE_HEIGHT, playerPos.z);
    syncAnglesToCamera();
  }
}

export function getCurrentPower(): string {
  return currentPower;
}

/**
 * Dispose all particle layers
 */
function disposeParticles(): void {
  for (const layer of particleLayers) {
    layer.points.geometry.dispose();
    if (layer.points.material instanceof THREE.Material) {
      layer.points.material.dispose();
    }
    if (scene) scene.remove(layer.points);
  }
  particleLayers.length = 0;
  cameraSway.enabled = false;
  cameraSway.phase = 0;
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

// --------------- Family Generators (Iter 16) ---------------
// Each family produces geometry for concepts that don't have exact dictionary matches.

const familyGenerators: Record<string, (rng: () => number, variant?: string) => THREE.Group> = {
  urban: createUrbanFamilyGroup,
  forest: createForestFamilyGroup,
  coastal: createCoastalFamilyGroup,
  sky: createSkyFamilyGroup,
  ruins: createRuinsFamilyGroup,
  mountains: createMountainsFamilyGroup,
  desert: createDesertFamilyGroup,
  water: createWaterFamilyGroup,
  surreal_abstract: createSurrealFamilyGroup,
  celestial: createCelestialFamilyGroup,
  architecture: createArchitectureFamilyGroup,
  frozen: createFrozenFamilyGroup,
  cave: createCaveFamilyGroup,
  organic: createOrganicFamilyGroup,
};

function createUrbanFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a4a50, roughness: 0.6, metalness: 0.15 });

  if (variant === "village" || variant === "bazaar") {
    // Small clustered buildings
    const count = 5 + Math.floor(rng() * 6);
    for (let i = 0; i < count; i++) {
      const w = 2 + rng() * 3;
      const h = 2 + rng() * 5;
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      building.position.set((rng() - 0.5) * 20, h / 2, (rng() - 0.5) * 20);
      building.castShadow = true;
      group.add(building);
    }
  } else if (variant === "rooftop") {
    // Flat platform with railing-like edges
    const floor = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 15), mat);
    floor.position.y = 12;
    floor.receiveShadow = true;
    group.add(floor);
    for (const [x, z] of [[-7, 0], [7, 0], [0, -7], [0, 7]] as [number, number][]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(x === 0 ? 15 : 0.3, 1.2, z === 0 ? 15 : 0.3), mat);
      rail.position.set(x, 12.9, z);
      group.add(rail);
    }
  } else {
    // Generic street / plaza: paved area with scattered boxes
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.2, 20),
      new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.9 })
    );
    ground.receiveShadow = true;
    group.add(ground);
    const count = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const w = 1 + rng() * 2;
      const h = 0.5 + rng() * 2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      box.position.set((rng() - 0.5) * 16, h / 2, (rng() - 0.5) * 16);
      box.castShadow = true;
      group.add(box);
    }
  }
  return group;
}

function createForestFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 });

  if (variant === "jungle" || variant === "marsh") {
    const leafColor = variant === "marsh" ? 0x2a4a2a : 0x0a3a0a;
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.7 });
    const count = 8 + Math.floor(rng() * 10);
    for (let i = 0; i < count; i++) {
      const trunkH = 4 + rng() * 8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 + rng() * 0.2, 0.2 + rng() * 0.2, trunkH, 6), trunkMat);
      trunk.position.set((rng() - 0.5) * 30, trunkH / 2, (rng() - 0.5) * 30);
      // Jungle trees lean slightly
      trunk.rotation.z = (rng() - 0.5) * 0.2;
      trunk.castShadow = true;
      group.add(trunk);
      const crownR = 2 + rng() * 3;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(crownR, 8, 8), leafMat);
      crown.position.set(trunk.position.x, trunkH + crownR * 0.4, trunk.position.z);
      crown.castShadow = true;
      group.add(crown);
    }
    if (variant === "marsh") {
      // Murky water patches
      const waterMat = new THREE.MeshStandardMaterial({ color: 0x2a4a3a, roughness: 0.4, transparent: true, opacity: 0.6 });
      for (let i = 0; i < 3; i++) {
        const r = 3 + rng() * 5;
        const water = new THREE.Mesh(new THREE.CircleGeometry(r, 16), waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.set((rng() - 0.5) * 20, 0.02, (rng() - 0.5) * 20);
        group.add(water);
      }
    }
  } else if (variant === "garden" || variant === "field") {
    // Short grass patches + scattered flowers
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3a6a30, roughness: 0.85 });
    for (let i = 0; i < 12; i++) {
      const r = 1 + rng() * 2;
      const patch = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), grassMat);
      patch.scale.y = 0.15;
      patch.position.set((rng() - 0.5) * 25, r * 0.05, (rng() - 0.5) * 25);
      group.add(patch);
    }
    // A few small trees
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.7 });
    for (let i = 0; i < 4; i++) {
      const h = 3 + rng() * 4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 6), trunkMat);
      trunk.position.set((rng() - 0.5) * 20, h / 2, (rng() - 0.5) * 20);
      trunk.castShadow = true;
      group.add(trunk);
      const cr = 1.5 + rng() * 2;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(cr, 8, 8), leafMat);
      crown.position.set(trunk.position.x, h + cr * 0.4, trunk.position.z);
      group.add(crown);
    }
  } else {
    // Default forest — delegate to existing
    return createForestGroup(rng);
  }
  return group;
}

function createCoastalFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();

  if (variant === "harbor") {
    // Wooden dock + water
    const dockMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2a, roughness: 0.9 });
    const dock = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 18), dockMat);
    dock.position.set(0, 1, 0);
    dock.castShadow = true;
    group.add(dock);
    // Posts
    for (let i = -3; i <= 3; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.5, 6), dockMat);
      post.position.set(rng() < 0.5 ? -1.8 : 1.8, 0.5, i * 2.5);
      group.add(post);
    }
    // Water
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a3a5e, roughness: 0.3, transparent: true, opacity: 0.8 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(30, 32), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.05;
    group.add(water);
  } else if (variant === "lighthouse") {
    // Tall cylinder + light sphere
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 });
    const h = 18 + rng() * 8;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.5, h, 12), baseMat);
    base.position.y = h / 2;
    base.castShadow = true;
    group.add(base);
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xffee88, emissive: new THREE.Color(0xffdd44), emissiveIntensity: 0.8, roughness: 0.2 })
    );
    light.position.y = h + 1.5;
    group.add(light);
  } else if (variant === "reef") {
    // Coral-like formations
    const colors = [0xd45a5a, 0xd4a05a, 0x5ad4a0, 0xd45ad4];
    const count = 6 + Math.floor(rng() * 6);
    for (let i = 0; i < count; i++) {
      const h = 1 + rng() * 3;
      const r = 0.5 + rng() * 1;
      const coral = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.3, r, h, 6),
        new THREE.MeshStandardMaterial({ color: colors[Math.floor(rng() * colors.length)], roughness: 0.7 })
      );
      coral.position.set((rng() - 0.5) * 15, h / 2, (rng() - 0.5) * 15);
      coral.rotation.z = (rng() - 0.5) * 0.3;
      coral.castShadow = true;
      group.add(coral);
    }
  } else if (variant === "island") {
    // Small land mass surrounded by water
    const land = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 12, 2, 16),
      new THREE.MeshStandardMaterial({ color: 0x6a8a4a, roughness: 0.9 })
    );
    land.position.y = 0.5;
    group.add(land);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a5a7a, roughness: 0.3, transparent: true, opacity: 0.7 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(40, 32), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.05;
    group.add(water);
  } else {
    return createBeachGroup(rng);
  }
  return group;
}

function createSkyFamilyGroup(rng: () => number, _variant?: string): THREE.Group {
  return createCloudGroup(rng);
}

function createRuinsFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  if (variant === "skull" || variant === "bone") {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.7 });
    const count = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i++) {
      const r = 0.3 + rng() * 0.8;
      const obj = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
      obj.position.set((rng() - 0.5) * 6, r * 0.5, (rng() - 0.5) * 6);
      obj.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
      group.add(obj);
    }
    return group;
  }
  if (variant === "cage" || variant === "chain") {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 0.6, metalness: 0.4 });
    // Vertical bars
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), mat);
      bar.position.set(Math.cos(i * Math.PI / 3) * 1.5, 2, Math.sin(i * Math.PI / 3) * 1.5);
      group.add(bar);
    }
    const top = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 6, 12), mat);
    top.position.y = 4;
    top.rotation.x = Math.PI / 2;
    group.add(top);
    return group;
  }
  return createRuinsGroup(rng);
}

function createMountainsFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  if (variant === "canyon" || variant === "valley") {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a6050, roughness: 0.9 });
    // Two tall cliff walls
    for (const side of [-1, 1]) {
      const h = 20 + rng() * 20;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(4 + rng() * 3, h, 30 + rng() * 20), mat);
      wall.position.set(side * (8 + rng() * 5), h / 2, 0);
      wall.castShadow = true;
      group.add(wall);
    }
    return group;
  }
  if (variant === "volcano") {
    const group = new THREE.Group();
    const h = 30 + rng() * 20;
    const r = 16 + rng() * 10;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 12),
      new THREE.MeshStandardMaterial({ color: 0x4a4040, roughness: 0.85 })
    );
    cone.position.y = h / 2;
    cone.castShadow = true;
    group.add(cone);
    // Lava glow at top
    const lava = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.15, r * 0.2, 2, 12),
      new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: new THREE.Color(0xff2200), emissiveIntensity: 0.6, roughness: 0.8 })
    );
    lava.position.y = h - 1;
    group.add(lava);
    return group;
  }
  if (variant === "plateau") {
    const group = new THREE.Group();
    const w = 20 + rng() * 15;
    const h = 8 + rng() * 10;
    const mesa = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, w),
      new THREE.MeshStandardMaterial({ color: 0x8a7060, roughness: 0.9 })
    );
    mesa.position.y = h / 2;
    mesa.castShadow = true;
    mesa.receiveShadow = true;
    group.add(mesa);
    return group;
  }
  return createMountainGroup(rng);
}

function createDesertFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();
  if (variant === "oasis") {
    // Small water pool + palm trees
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x2a7a8a, roughness: 0.3, transparent: true, opacity: 0.7 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(5, 24), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.02;
    group.add(water);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a5030, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a6a2a, roughness: 0.7 });
    for (let i = 0; i < 3; i++) {
      const h = 5 + rng() * 4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, h, 6), trunkMat);
      trunk.position.set((rng() - 0.5) * 8, h / 2, (rng() - 0.5) * 8);
      trunk.rotation.z = (rng() - 0.5) * 0.15;
      group.add(trunk);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(2 + rng(), 8, 6), leafMat);
      leaf.scale.y = 0.4;
      leaf.position.set(trunk.position.x, h, trunk.position.z);
      group.add(leaf);
    }
  } else {
    // Dune fields + rock pillars
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xc8a860, roughness: 0.95 });
    for (let i = 0; i < 5; i++) {
      const r = 4 + rng() * 8;
      const dune = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6), sandMat);
      dune.scale.y = 0.25;
      dune.position.set((rng() - 0.5) * 40, 0, (rng() - 0.5) * 40);
      group.add(dune);
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7560, roughness: 0.85 });
    for (let i = 0; i < 3; i++) {
      const h = 4 + rng() * 10;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.5, h, 8), rockMat);
      pillar.position.set((rng() - 0.5) * 25, h / 2, (rng() - 0.5) * 25);
      pillar.castShadow = true;
      group.add(pillar);
    }
  }
  return group;
}

function createWaterFamilyGroup(rng: () => number, _variant?: string): THREE.Group {
  return createOceanGroup(rng);
}

function createSurrealFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();
  const emissiveMat = new THREE.MeshStandardMaterial({
    color: 0x6a4a8a, roughness: 0.2, metalness: 0.3,
    emissive: new THREE.Color(0x4a2a6a), emissiveIntensity: 0.4,
    transparent: true, opacity: 0.7
  });

  if (variant === "mirror") {
    // Tall reflective plane
    const mirror = new THREE.Mesh(
      new THREE.BoxGeometry(6, 10, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xaabbcc, roughness: 0, metalness: 0.9, transparent: true, opacity: 0.8 })
    );
    mirror.position.y = 5;
    mirror.castShadow = true;
    group.add(mirror);
  } else if (variant === "ring") {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.4, 12, 24),
      emissiveMat
    );
    ring.position.y = 5;
    ring.rotation.x = Math.PI / 6;
    group.add(ring);
    group.userData.floating = true;
  } else if (variant === "mask") {
    // Abstract face shape
    const face = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8), emissiveMat);
    face.scale.z = 0.3;
    face.position.y = 4;
    group.add(face);
    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.8 });
    for (const x of [-0.6, 0.6]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), eyeMat);
      eye.position.set(x, 4.3, 0.5);
      group.add(eye);
    }
  } else {
    // Impossible geometry: floating shapes, inverted structures
    const count = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i++) {
      const type = Math.floor(rng() * 4);
      let mesh: THREE.Mesh;
      const s = 1 + rng() * 3;
      if (type === 0) mesh = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), emissiveMat);
      else if (type === 1) mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(s, 0), emissiveMat);
      else if (type === 2) mesh = new THREE.Mesh(new THREE.TorusGeometry(s, s * 0.3, 8, 16), emissiveMat);
      else mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), emissiveMat);
      mesh.position.set((rng() - 0.5) * 15, 2 + rng() * 10, (rng() - 0.5) * 15);
      mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      mesh.castShadow = true;
      group.add(mesh);
    }
    group.userData.floating = true;
  }
  return group;
}

function createCelestialFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xaabbff, roughness: 0.1, metalness: 0.2,
    emissive: new THREE.Color(0x6688cc), emissiveIntensity: 0.5,
    transparent: true, opacity: 0.7
  });

  if (variant === "orb") {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), glowMat);
    sphere.position.y = 3;
    group.add(sphere);
    group.userData.floating = true;
  } else {
    // Nebula-like cluster of glowing spheres
    const count = 5 + Math.floor(rng() * 8);
    for (let i = 0; i < count; i++) {
      const r = 0.5 + rng() * 2;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), glowMat);
      orb.position.set((rng() - 0.5) * 20, 5 + rng() * 15, (rng() - 0.5) * 20);
      group.add(orb);
    }
    group.userData.floating = true;
  }
  return group;
}

function createArchitectureFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.75, metalness: 0.05 });

  if (variant === "temple") {
    // Pillared structure with flat roof
    const roofH = 8;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 12), stoneMat);
    roof.position.y = roofH;
    roof.castShadow = true;
    group.add(roof);
    for (let x = -1; x <= 1; x += 2) {
      for (let z = -1; z <= 1; z += 2) {
        const h = roofH;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, h, 10), stoneMat);
        col.position.set(x * 5, h / 2, z * 5);
        col.castShadow = true;
        group.add(col);
      }
    }
    // Steps
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(14 - i * 2, 0.3, 14 - i * 2), stoneMat);
      step.position.y = i * 0.3;
      group.add(step);
    }
  } else if (variant === "palace") {
    // Grand building: wider castle
    const w = 16;
    const h = 12;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), stoneMat);
    body.position.y = h / 2;
    body.castShadow = true;
    group.add(body);
    // Dome
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(w * 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xd4a843, roughness: 0.4, metalness: 0.3 })
    );
    dome.position.y = h;
    group.add(dome);
  } else if (variant === "library") {
    // Tall shelved building
    const h = 10;
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, h, 8), stoneMat);
    body.position.y = h / 2;
    body.castShadow = true;
    group.add(body);
    // Window rows
    const windowMat = new THREE.MeshStandardMaterial({ color: 0xd4c080, emissive: new THREE.Color(0xd4c080), emissiveIntensity: 0.3 });
    for (let y = 2; y < h; y += 2) {
      for (let x = -3; x <= 3; x += 3) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.1), windowMat);
        win.position.set(x, y, 4.05);
        group.add(win);
      }
    }
  } else if (variant === "arena") {
    // Circular colosseum
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(12, 3, 8, 24),
      stoneMat
    );
    ring.position.y = 3;
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    group.add(ring);
  } else if (variant === "pyramid") {
    const h = 15 + rng() * 10;
    const r = h * 0.7;
    const pyramid = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), new THREE.MeshStandardMaterial({ color: 0xc8a860, roughness: 0.8 }));
    pyramid.position.y = h / 2;
    pyramid.rotation.y = Math.PI / 4;
    pyramid.castShadow = true;
    group.add(pyramid);
  } else if (variant === "dome") {
    const r = 6 + rng() * 4;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      stoneMat
    );
    dome.castShadow = true;
    group.add(dome);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 16), stoneMat);
    base.position.y = -0.5;
    group.add(base);
  } else if (variant === "arch") {
    // Simple arch
    const h = 6 + rng() * 3;
    for (const x of [-3, 3]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1, h, 1), stoneMat);
      col.position.set(x, h / 2, 0);
      col.castShadow = true;
      group.add(col);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 1.5), stoneMat);
    top.position.y = h;
    top.castShadow = true;
    group.add(top);
  } else if (variant === "steeple") {
    const h = 20 + rng() * 10;
    const steeple = new THREE.Mesh(
      new THREE.ConeGeometry(2, h, 8),
      new THREE.MeshStandardMaterial({ color: 0x6a6a70, roughness: 0.6, metalness: 0.2 })
    );
    steeple.position.y = h / 2;
    steeple.castShadow = true;
    group.add(steeple);
  } else if (variant === "fountain") {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 1, 16), stoneMat);
    base.position.y = 0.5;
    group.add(base);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 8), stoneMat);
    col.position.y = 2.5;
    group.add(col);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x4488aa, roughness: 0.2, transparent: true, opacity: 0.6 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.3, 16), waterMat);
    water.position.y = 0.8;
    group.add(water);
  } else {
    // Fallback: delegate to castle or pillar
    return createCastleGroup(rng);
  }
  return group;
}

function createFrozenFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0xb8d8e8, roughness: 0.05, metalness: 0.2,
    transparent: true, opacity: 0.75
  });

  if (variant === "glacier") {
    // Large ice blocks
    const count = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i++) {
      const w = 3 + rng() * 8;
      const h = 3 + rng() * 10;
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.6 + rng() * 0.4)), iceMat);
      block.position.set((rng() - 0.5) * 25, h / 2, (rng() - 0.5) * 25);
      block.rotation.y = rng() * Math.PI;
      block.rotation.z = (rng() - 0.5) * 0.2;
      block.castShadow = true;
      group.add(block);
    }
  } else {
    // Tundra: flat with sparse ice spikes
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 32),
      new THREE.MeshStandardMaterial({ color: 0xd0d8e0, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    group.add(ground);
    const count = 6 + Math.floor(rng() * 6);
    for (let i = 0; i < count; i++) {
      const h = 1 + rng() * 5;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.5 + rng() * 0.5, h, 6), iceMat);
      spike.position.set((rng() - 0.5) * 25, h / 2, (rng() - 0.5) * 25);
      spike.castShadow = true;
      group.add(spike);
    }
  }
  return group;
}

function createCaveFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();
  const darkRock = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.9 });

  // Cave ceiling (inverted dome)
  const ceiling = new THREE.Mesh(
    new THREE.SphereGeometry(25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95, side: THREE.BackSide })
  );
  ceiling.position.y = 15;
  ceiling.rotation.x = Math.PI;
  group.add(ceiling);

  // Stalactites
  const count = 8 + Math.floor(rng() * 8);
  for (let i = 0; i < count; i++) {
    const h = 2 + rng() * 6;
    const stalactite = new THREE.Mesh(new THREE.ConeGeometry(0.3 + rng() * 0.5, h, 6), darkRock);
    stalactite.position.set((rng() - 0.5) * 20, 15 - h / 2, (rng() - 0.5) * 20);
    stalactite.rotation.x = Math.PI; // point downward
    group.add(stalactite);
  }

  // Stalagmites
  for (let i = 0; i < count; i++) {
    const h = 1 + rng() * 4;
    const stalagmite = new THREE.Mesh(new THREE.ConeGeometry(0.3 + rng() * 0.4, h, 6), darkRock);
    stalagmite.position.set((rng() - 0.5) * 20, h / 2, (rng() - 0.5) * 20);
    stalagmite.castShadow = true;
    group.add(stalagmite);
  }

  if (variant === "crystal") {
    // Glowing crystals growing from walls
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x7bb8d4, roughness: 0.1, metalness: 0.3,
      emissive: new THREE.Color(0x4488aa), emissiveIntensity: 0.4,
      transparent: true, opacity: 0.7
    });
    for (let i = 0; i < 6; i++) {
      const h = 2 + rng() * 4;
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.4, h, 6), crystalMat);
      crystal.position.set((rng() - 0.5) * 15, rng() * 8, (rng() - 0.5) * 15);
      crystal.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.5);
      group.add(crystal);
    }
  }

  if (variant === "crypt" || variant === "dungeon") {
    // Sarcophagus / wall blocks
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4a50, roughness: 0.85 });
    for (let i = 0; i < 4; i++) {
      const w = 2 + rng() * 3;
      const h = 1.5 + rng() * 2;
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.6), wallMat);
      block.position.set((rng() - 0.5) * 12, h / 2, (rng() - 0.5) * 12);
      block.castShadow = true;
      group.add(block);
    }
  }

  return group;
}

function createOrganicFamilyGroup(rng: () => number, variant?: string): THREE.Group {
  const group = new THREE.Group();

  if (variant === "fire" || variant === "lantern") {
    // Glowing fire/light source
    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xff8800,
      emissive: new THREE.Color(0xff4400),
      emissiveIntensity: 0.7,
      roughness: 0.5
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2, 8), fireMat);
    flame.position.y = 1.5;
    group.add(flame);
    // Base logs
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.5, 6), logMat);
      log.position.set(Math.cos(i * 2.1) * 0.4, 0.15, Math.sin(i * 2.1) * 0.4);
      log.rotation.z = Math.PI / 2 + (rng() - 0.5) * 0.3;
      group.add(log);
    }
  } else if (variant === "flower") {
    // Colorful flowers
    const colors = [0xff6688, 0xffaa44, 0x66aaff, 0xff66ff, 0xffff44];
    const count = 5 + Math.floor(rng() * 8);
    for (let i = 0; i < count; i++) {
      const stemH = 0.5 + rng() * 1;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, stemH, 4),
        new THREE.MeshStandardMaterial({ color: 0x2a6a2a })
      );
      stem.position.set((rng() - 0.5) * 6, stemH / 2, (rng() - 0.5) * 6);
      group.add(stem);
      const petal = new THREE.Mesh(
        new THREE.SphereGeometry(0.15 + rng() * 0.1, 6, 6),
        new THREE.MeshStandardMaterial({ color: colors[Math.floor(rng() * colors.length)] })
      );
      petal.position.set(stem.position.x, stemH + 0.1, stem.position.z);
      group.add(petal);
    }
  } else {
    // Generic organic — mushrooms, vines, etc.
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 });
    const count = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i++) {
      const h = 0.5 + rng() * 2;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, h, 6), mat);
      stem.position.set((rng() - 0.5) * 8, h / 2, (rng() - 0.5) * 8);
      group.add(stem);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.4 + rng() * 0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xc06040, roughness: 0.7 })
      );
      cap.position.set(stem.position.x, h, stem.position.z);
      group.add(cap);
    }
  }
  return group;
}

// ── 16C: Living presence generators ──────────────────────────────────

const SKIN_COLORS = [0xc8a882, 0xa87050, 0x7a5a3a, 0xd4b896, 0x8c6848];
const CREATURE_COLORS = [0x4a6a4a, 0x5a3a5a, 0x3a5a6a, 0x6a5a3a, 0x5a5a5a];

function createHumanoidGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const skinColor = SKIN_COLORS[Math.floor(rng() * SKIN_COLORS.length)];
  const clothColor = Math.floor(rng() * 0xffffff);
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
  const clothMat = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.6 });
  // 16E: Improved proportions — taller, more readable
  const bodyH = 0.9 + rng() * 0.35;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, bodyH, 6, 12), clothMat);
  body.position.y = bodyH / 2 + 0.55;
  body.castShadow = true;
  group.add(body);
  // Head — slightly larger
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), skinMat);
  head.position.y = bodyH + 0.8;
  head.castShadow = true;
  group.add(head);
  // Legs — longer, thicker
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.55, 6), clothMat);
    leg.position.set(side * 0.13, 0.27, 0);
    leg.castShadow = true;
    group.add(leg);
  }
  // Arms — longer, slightly angled
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.55, 6), skinMat);
    arm.position.set(side * 0.35, bodyH / 2 + 0.45, 0);
    arm.rotation.z = side * 0.2;
    arm.castShadow = true;
    group.add(arm);
    // Hands
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat);
    hand.position.set(side * 0.4, bodyH / 2 + 0.12, 0);
    group.add(hand);
  }
  // Random facing
  group.rotation.y = rng() * Math.PI * 2;
  group.userData.livingPresence = "humanoid";
  return group;
}

function createAnimalGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const furColor = [0x8a6a3a, 0x5a4a2a, 0xaaa080, 0x6a6a6a, 0xc0a060][Math.floor(rng() * 5)];
  const mat = new THREE.MeshStandardMaterial({ color: furColor, roughness: 0.85 });
  // 16E: Larger, more readable body
  const bodyLen = 0.8 + rng() * 0.6;
  const bodyR = 0.22 + rng() * 0.08;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, bodyLen, 6, 10), mat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);
  // Head — larger
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mat);
  head.position.set(bodyLen / 2 + 0.2, 0.55, 0);
  head.castShadow = true;
  group.add(head);
  // Snout
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 6), mat);
  snout.position.set(bodyLen / 2 + 0.38, 0.52, 0);
  snout.rotation.z = -Math.PI / 2;
  group.add(snout);
  // Ears
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), mat);
    ear.position.set(bodyLen / 2 + 0.12, 0.72, side * 0.1);
    group.add(ear);
  }
  // Four legs — longer
  for (const [lx, lz] of [[0.25, 0.16], [0.25, -0.16], [-0.25, 0.16], [-0.25, -0.16]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 5), mat);
    leg.position.set(lx, 0.22, lz);
    leg.castShadow = true;
    group.add(leg);
  }
  // Tail — curving upward
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.35, 5), mat);
  tail.position.set(-bodyLen / 2 - 0.25, 0.6, 0);
  tail.rotation.z = -0.5;
  group.add(tail);
  group.rotation.y = rng() * Math.PI * 2;
  group.userData.livingPresence = "animal";
  return group;
}

function createCreatureGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const color = CREATURE_COLORS[Math.floor(rng() * CREATURE_COLORS.length)];
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: new THREE.Color(color).multiplyScalar(0.15), emissiveIntensity: 0.4 });
  // Abstract body — octahedron or dodecahedron
  const useOcta = rng() > 0.5;
  const bodyR = 0.3 + rng() * 0.3;
  const bodyGeo = useOcta
    ? new THREE.OctahedronGeometry(bodyR, 0)
    : new THREE.DodecahedronGeometry(bodyR, 0);
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.y = bodyR + 0.3;
  body.castShadow = true;
  group.add(body);
  // Tendrils / appendages
  const tendrilCount = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < tendrilCount; i++) {
    const tLen = 0.3 + rng() * 0.5;
    const tendril = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.01, tLen, 5),
      mat
    );
    const angle = (i / tendrilCount) * Math.PI * 2;
    tendril.position.set(
      Math.cos(angle) * bodyR * 0.8,
      bodyR * 0.3 + rng() * 0.3,
      Math.sin(angle) * bodyR * 0.8
    );
    tendril.rotation.x = (rng() - 0.5) * 1.2;
    tendril.rotation.z = (rng() - 0.5) * 1.2;
    group.add(tendril);
  }
  // Eye(s)
  const eyeCount = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < eyeCount; i++) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xeeffee, emissive: 0xaaffaa, emissiveIntensity: 0.8 })
    );
    const ea = (i / eyeCount) * Math.PI * 0.6 - 0.3;
    eye.position.set(Math.sin(ea) * bodyR * 0.9, bodyR + 0.3 + i * 0.06, -Math.cos(ea) * bodyR * 0.5);
    group.add(eye);
  }
  group.rotation.y = rng() * Math.PI * 2;
  group.userData.livingPresence = "creature";
  return group;
}

// ── 18C: Turtle living entity — for beach/ocean scenes ───────────────
function createTurtleGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const shellColor = [0x4a6a3a, 0x3a5a2a, 0x5a7040, 0x2a4a2a][Math.floor(rng() * 4)];
  const skinColor = 0x6a8050;
  const shellMat = new THREE.MeshStandardMaterial({ color: shellColor, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.9 });
  // Shell dome
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), shellMat);
  shell.scale.y = 0.62;
  shell.position.y = 0.22;
  shell.castShadow = true;
  group.add(shell);
  // Shell underside (flat)
  const belly = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10), skinMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.y = 0.14;
  group.add(belly);
  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), skinMat);
  head.position.set(0.55, 0.22, 0);
  head.castShadow = true;
  group.add(head);
  // Four flippers
  for (const [fx, fz] of [[0.3, 0.45], [0.3, -0.45], [-0.3, 0.45], [-0.3, -0.45]]) {
    const flipper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.18), skinMat);
    flipper.position.set(fx, 0.12, fz);
    flipper.rotation.y = fz > 0 ? -0.3 : 0.3;
    group.add(flipper);
  }
  // Tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), skinMat);
  tail.rotation.z = -Math.PI / 2;
  tail.position.set(-0.6, 0.18, 0);
  group.add(tail);
  group.rotation.y = rng() * Math.PI * 2;
  group.userData.livingPresence = "turtle";
  return group;
}

// ── 16C: Living presence arrays for density population ───────────────
const livingPresenceCreators = [createHumanoidGroup, createAnimalGroup, createCreatureGroup];

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
  ruin: createRuinGroup,
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
  "dream zone": createDreamZoneGroup,
  // 16C: Living presence
  human: createHumanoidGroup,
  humanoid: createHumanoidGroup,
  person: createHumanoidGroup,
  people: createHumanoidGroup,
  wanderer: createHumanoidGroup,
  wanderers: createHumanoidGroup,
  guardian: createHumanoidGroup,
  guardians: createHumanoidGroup,
  sentinel: createHumanoidGroup,
  sentinels: createHumanoidGroup,
  pilgrim: createHumanoidGroup,
  pilgrims: createHumanoidGroup,
  animal: createAnimalGroup,
  animals: createAnimalGroup,
  beast: createAnimalGroup,
  beasts: createAnimalGroup,
  creature: createCreatureGroup,
  creatures: createCreatureGroup,
  spirit: createCreatureGroup,
  spirits: createCreatureGroup,
  ghost: createCreatureGroup,
  ghosts: createCreatureGroup,
  wraith: createCreatureGroup,
  wraiths: createCreatureGroup,
  shadow: createCreatureGroup,
  shadows: createCreatureGroup,
  // 16K: Micro-generator entries
  bell: createBellGroup,
  bells: createBellGroup,
  temple: createTempleGroup,
  temples: createTempleGroup,
  cave: createCaveGroup,
  caves: createCaveGroup,
  arena: createArenaGroup,
  spire: createSpireGroup,
  spires: createSpireGroup,
  lava: createLavaGroup,
  magma: createLavaGroup,
  fountain: createFountainGroup,
  fountains: createFountainGroup,
  altar: createAltarGroup,
  altars: createAltarGroup,
  shrine: createShrineGroup,
  shrines: createShrineGroup,
  campfire: createCampfireGroup,
  camp: createCampfireGroup,
  // 16E: New dream-specific generators
  deer: createDeerGroup,
  stag: createDeerGroup,
  elk: createDeerGroup,
  doe: createDeerGroup,
  grass: createGrassGroup,
  grasses: createGrassGroup,
  meadow: createGrassGroup,
  field: createGrassGroup,
  prairie: createGrassGroup,
  rubble: createRuinGroup,
  debris: createRuinGroup,
  remnant: createRuinGroup,
  remnants: createRuinGroup,
  // 16E: Additional noun coverage
  wolf: createAnimalGroup,
  wolves: createAnimalGroup,
  fox: createAnimalGroup,
  cat: createAnimalGroup,
  dog: createAnimalGroup,
  horse: createAnimalGroup,
  bear: createAnimalGroup,
  rabbit: createAnimalGroup,
  bird: createCreatureGroup,
  birds: createCreatureGroup,
  monk: createHumanoidGroup,
  monks: createHumanoidGroup,
  villager: createHumanoidGroup,
  villagers: createHumanoidGroup,
  knight: createHumanoidGroup,
  knights: createHumanoidGroup,
  warrior: createHumanoidGroup,
  warriors: createHumanoidGroup,
  church: createTempleGroup,
  cathedral: createTempleGroup,
  monastery: createTempleGroup,
  chapel: createTempleGroup,
  tomb: createCaveGroup,
  cavern: createCaveGroup,
  grotto: createCaveGroup,
  colosseum: createArenaGroup,
  amphitheater: createArenaGroup,
  obelisk: createSpireGroup,
  minaret: createSpireGroup,
  lighthouse: createSpireGroup,
  garden: createGrassGroup,
  park: createGrassGroup,
  bonfire: createCampfireGroup,
  fire: createCampfireGroup,
  torch: createCampfireGroup,
  well: createFountainGroup,
  pool: createFountainGroup,
  pond: createOceanGroup,
  waterfall: createFountainGroup,
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
  // 18B: Wider, more beach-like platform with layered shoreline
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(SCALE.beachW * 1.6, 0.3, SCALE.beachD * 1.4),
    new THREE.MeshStandardMaterial({
      color: 0xd4bb7a,
      roughness: 0.97,
      metalness: 0.01
    })
  );
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);

  // 18B: Foam/wave edge ring at shoreline transition
  const foamMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8f0,
    roughness: 0.9,
    transparent: true,
    opacity: 0.75
  });
  const foamW = SCALE.beachW * 1.6 + 1.5;
  const foamD = 3.0;
  const foam = new THREE.Mesh(
    new THREE.BoxGeometry(foamW, 0.06, foamD),
    foamMat
  );
  foam.position.set(0, 0.17, -(SCALE.beachD * 1.4 * 0.5 - foamD * 0.5 - 0.5));
  foam.receiveShadow = true;
  group.add(foam);

  // 18B: Shell and driftwood scatter
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xe8d8c0, roughness: 0.7 });
  const driftMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 });
  const shellCount = 4 + Math.floor(rng() * 5);
  for (let si = 0; si < shellCount; si++) {
    const r = 0.12 + rng() * 0.18;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), shellMat);
    shell.scale.y = 0.35;
    shell.position.set(
      (rng() - 0.5) * SCALE.beachW * 1.4,
      0.17,
      (rng() - 0.5) * SCALE.beachD * 1.0
    );
    group.add(shell);
  }
  // Driftwood logs
  const logCount = 2 + Math.floor(rng() * 3);
  for (let li = 0; li < logCount; li++) {
    const logL = 1.5 + rng() * 2.5;
    const logR = 0.14 + rng() * 0.1;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(logR, logR * 0.8, logL, 6), driftMat);
    log.position.set(
      (rng() - 0.5) * SCALE.beachW * 1.2,
      0.19,
      (rng() - 0.5) * SCALE.beachD * 0.8
    );
    log.rotation.y = rng() * Math.PI;
    log.rotation.z = (rng() - 0.5) * 0.3;
    group.add(log);
  }

  if (hasOcean) {
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(SCALE.beachW * 1.8, 0.12, SCALE.beachD * 0.8),
      new THREE.MeshStandardMaterial({
        color: 0x2b5a8a,
        roughness: 0.25,
        metalness: 0.25,
        transparent: true,
        opacity: 0.88
      })
    );
    water.position.set(0, -0.04, -(SCALE.beachD * 1.4 * 0.75));
    water.receiveShadow = true;
    group.add(water);
  }

  // 18C: Beach seagull silhouettes circling overhead
  const birdMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const birdCount = 4 + Math.floor(rng() * 5);
  for (let bi = 0; bi < birdCount; bi++) {
    // Each bird = two small curved wings (boxes slightly tilted)
    const bird = new THREE.Group();
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.12), birdMat);
      wing.position.set(side * 0.22, 0, 0);
      wing.rotation.z = side * 0.18;
      bird.add(wing);
    }
    bird.position.set(
      (rng() - 0.5) * SCALE.beachW * 1.6,
      5 + rng() * 6,
      -SCALE.beachD * 0.5 - rng() * 8
    );
    bird.userData.seagull = true;
    bird.userData.drift = rng() * Math.PI * 2;
    group.add(bird);
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

// ── 16K: Micro-generator upgrades ────────────────────────────────────

function createBellGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb8a060, roughness: 0.35, metalness: 0.6 });
  const bellR = 0.6 + rng() * 0.4;
  const bellH = bellR * 1.6;
  // 16E: Bell tower frame — two posts with crossbeam
  const frameH = bellH + 2.2;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, frameH, 6), frameMat);
    post.position.set(side * bellR * 1.6, frameH / 2, 0);
    post.castShadow = true;
    group.add(post);
  }
  // Crossbeam
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(bellR * 3.6, 0.2, 0.2),
    frameMat
  );
  beam.position.y = frameH - 0.1;
  beam.castShadow = true;
  group.add(beam);
  // Bell body — open-bottomed cylinder tapered at top
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(bellR * 0.3, bellR, bellH, 12, 1, true), mat);
  bell.position.y = frameH - bellH / 2 - 0.5;
  bell.castShadow = true;
  group.add(bell);
  // Clapper
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(bellR * 0.18, 8, 8), mat);
  clapper.position.y = frameH - bellH - 0.3;
  group.add(clapper);
  // 16E: Slight random tilt for character
  group.rotation.z = (rng() - 0.5) * 0.08;
  return group;
}

function createTempleGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd0c8b8, roughness: 0.65, metalness: 0.05 });
  const w = 6 + rng() * 4;
  const d = 5 + rng() * 3;
  const h = 4 + rng() * 3;
  // 16E: Stepped base — 3 tiers
  for (let tier = 0; tier < 3; tier++) {
    const tW = w + 2 - tier * 0.6;
    const tD = d + 2 - tier * 0.5;
    const step = new THREE.Mesh(new THREE.BoxGeometry(tW, 0.25, tD), mat);
    step.position.y = tier * 0.25 + 0.125;
    step.receiveShadow = true;
    group.add(step);
  }
  const baseH = 0.75;
  // Columns — 4 corners + 2 middle front
  const colH = h * 0.8;
  const colMat = new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.6 });
  const positions: [number, number][] = [
    [-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, -d / 2], [w / 2, d / 2],
    [-w / 4, -d / 2], [w / 4, -d / 2]
  ];
  for (const [cx, cz] of positions) {
    // Column with fluted cap
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, colH, 10), colMat);
    col.position.set(cx, baseH + colH / 2, cz);
    col.castShadow = true;
    group.add(col);
    // Column capital
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.7), colMat);
    cap.position.set(cx, baseH + colH + 0.075, cz);
    group.add(cap);
  }
  // Architrave (beam across top of columns)
  const architrave = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.3, d + 1), mat);
  architrave.position.y = baseH + colH + 0.15 + 0.15;
  architrave.castShadow = true;
  group.add(architrave);
  // Pediment (triangular roof)
  const peak = new THREE.Mesh(new THREE.ConeGeometry(w * 0.52, h * 0.3, 4), mat);
  peak.position.y = baseH + colH + 0.5 + h * 0.15;
  peak.rotation.y = Math.PI / 4;
  peak.castShadow = true;
  group.add(peak);
  // 16E: Front stairs
  const stairMat = new THREE.MeshStandardMaterial({ color: 0xc4bca8, roughness: 0.7 });
  for (let s = 0; s < 4; s++) {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.15, 0.5), stairMat);
    stair.position.set(0, s * 0.15 + 0.075, -d / 2 - 0.6 - s * 0.45);
    stair.receiveShadow = true;
    group.add(stair);
  }
  // 18: Magical light shafts descending through columns
  const shaftCount = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < shaftCount; i++) {
    const shaftH = colH + h * 0.3;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.25, shaftH, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff0a0,
        transparent: true,
        opacity: 0.07 + rng() * 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const angle = (i / shaftCount) * Math.PI * 2;
    const rad = rng() * w * 0.35;
    shaft.position.set(Math.cos(angle) * rad, baseH + shaftH / 2 - 0.5, Math.sin(angle) * rad);
    group.add(shaft);
    // small glow pool at base of shaft
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(0.3 + rng() * 0.2, 12),
      new THREE.MeshBasicMaterial({ color: 0xffee80, transparent: true, opacity: 0.18, depthWrite: false })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(shaft.position.x, baseH + 0.05, shaft.position.z);
    group.add(pool);
  }
  // 18: Temple attendant silhouettes (2–4 figures near stairs)
  const attendantCount = 2 + Math.floor(rng() * 3);
  const figMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.9 });
  for (let i = 0; i < attendantCount; i++) {
    const fig = new THREE.Group();
    // body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6), figMat);
    body.position.y = 0.45;
    fig.add(body);
    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), figMat);
    head.position.y = 0.95;
    fig.add(head);
    const side = (rng() > 0.5 ? 1 : -1) * (w * 0.3 + rng() * w * 0.25);
    fig.position.set(side, 0, -d / 2 - 1.2 - rng() * 1.5);
    group.add(fig);
  }
  return group;
}

function createCaveGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.9 });
  const w = 4 + rng() * 3;
  const h = 3 + rng() * 2;
  // 16E: Enclosing dome ceiling
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(w * 0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.95, side: THREE.BackSide })
  );
  dome.position.y = 0;
  group.add(dome);
  // Arch opening — torus arc
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(h * 0.7, 0.8, 8, 16, Math.PI),
    mat
  );
  arch.position.y = h * 0.3;
  arch.rotation.z = Math.PI;
  arch.castShadow = true;
  group.add(arch);
  // Side boulder clusters
  for (const side of [-1, 1]) {
    const count = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < count; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rng() * 0.9, 0), mat);
      rock.position.set(side * (w * 0.35 + rng() * 0.5), 0.4 + rng() * 0.6, (rng() - 0.5) * 1.5);
      rock.castShadow = true;
      group.add(rock);
    }
  }
  // Stalactites hanging from dome
  const stalCount = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < stalCount; i++) {
    const sH = 0.4 + rng() * 1.2;
    const stal = new THREE.Mesh(new THREE.ConeGeometry(0.1 + rng() * 0.08, sH, 5), mat);
    const angle = rng() * Math.PI * 2;
    const rad = rng() * w * 0.4;
    stal.position.set(Math.cos(angle) * rad, h * 0.45 + rng() * 0.5, Math.sin(angle) * rad);
    stal.rotation.x = Math.PI; // point downward
    group.add(stal);
  }
  // 16E: Stalagmites rising from floor
  const stagCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < stagCount; i++) {
    const sH = 0.3 + rng() * 0.8;
    const stag = new THREE.Mesh(new THREE.ConeGeometry(0.1 + rng() * 0.06, sH, 5), mat);
    const angle = rng() * Math.PI * 2;
    const rad = 0.5 + rng() * w * 0.3;
    stag.position.set(Math.cos(angle) * rad, sH / 2, Math.sin(angle) * rad);
    group.add(stag);
  }
  // Dark interior backdrop
  const interior = new THREE.Mesh(
    new THREE.CircleGeometry(w * 0.55, 16),
    new THREE.MeshStandardMaterial({ color: 0x080810, roughness: 1.0 })
  );
  interior.rotation.x = -Math.PI / 2;
  interior.position.y = 0.03;
  group.add(interior);
  // 18: Magical glowing crystal cluster in cave center
  const crystalColors = [0x40e0ff, 0x80aaff, 0xaa60ff, 0x20ffcc];
  const cCount = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < cCount; i++) {
    const cH = 0.5 + rng() * 1.4;
    const crystalMat = new THREE.MeshStandardMaterial({
      color: crystalColors[Math.floor(rng() * crystalColors.length)],
      emissive: crystalColors[Math.floor(rng() * crystalColors.length)],
      emissiveIntensity: 0.7 + rng() * 0.5,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.75,
    });
    const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.08 + rng() * 0.1, cH, 6), crystalMat);
    const angle = rng() * Math.PI * 2;
    const rad = rng() * 0.6;
    crystal.position.set(Math.cos(angle) * rad, cH / 2 + 0.05, Math.sin(angle) * rad);
    crystal.rotation.z = (rng() - 0.5) * 0.3;
    crystal.castShadow = false;
    group.add(crystal);
  }
  // Emanating glow pool under crystals
  const glowPool = new THREE.Mesh(
    new THREE.CircleGeometry(0.8, 16),
    new THREE.MeshBasicMaterial({ color: 0x4080ff, transparent: true, opacity: 0.2, depthWrite: false })
  );
  glowPool.rotation.x = -Math.PI / 2;
  glowPool.position.y = 0.04;
  group.add(glowPool);
  return group;
}

function createArenaGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb0a890, roughness: 0.75 });
  const outerR = 8 + rng() * 4;
  const innerR = outerR * 0.7;
  const wallH = 3 + rng() * 2;
  // Tiered seating — 3 concentric rings stepping up
  for (let tier = 0; tier < 3; tier++) {
    const r = innerR + (outerR - innerR) * (tier / 3);
    const rOuter = innerR + (outerR - innerR) * ((tier + 1) / 3);
    const tH = (tier + 1) * (wallH / 3);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r, rOuter, 24),
      mat
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = tH;
    ring.receiveShadow = true;
    group.add(ring);
    // Vertical wall for this tier
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(rOuter, rOuter, tH, 24, 1, true),
      mat
    );
    wall.position.y = tH / 2;
    wall.castShadow = true;
    group.add(wall);
  }
  // Arena floor
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(innerR, 24),
    new THREE.MeshStandardMaterial({ color: 0xc8b880, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.05;
  floor.receiveShadow = true;
  group.add(floor);
  // 16E: Entrance gateway — gap in wall with pillars
  const gateH = wallH + 0.5;
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xa09878, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, gateH, 8), gateMat);
    pillar.position.set(side * 1.5, gateH / 2, -outerR + 0.2);
    pillar.castShadow = true;
    group.add(pillar);
  }
  // Lintel over entrance
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 0.6), gateMat);
  lintel.position.set(0, gateH + 0.2, -outerR + 0.2);
  lintel.castShadow = true;
  group.add(lintel);
  return group;
}

function createSpireGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const h = 10 + rng() * 12;
  const baseR = 1.2 + rng() * 0.6;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6a7080,
    roughness: 0.4,
    metalness: 0.25
  });
  // 16E: Elegant multi-stage spire
  // Base section — wider cylinder
  const baseH = h * 0.25;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(baseR, baseR * 1.15, baseH, 8), mat);
  base.position.y = baseH / 2;
  base.castShadow = true;
  group.add(base);
  // Mid section — tapered
  const midH = h * 0.35;
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 0.6, baseR, midH, 8), mat);
  mid.position.y = baseH + midH / 2;
  mid.castShadow = true;
  group.add(mid);
  // Top cone — pointed
  const topH = h * 0.4;
  const top = new THREE.Mesh(new THREE.ConeGeometry(baseR * 0.55, topH, 8), mat);
  top.position.y = baseH + midH + topH / 2;
  top.castShadow = true;
  group.add(top);
  // Decorative rings at transitions
  for (const y of [baseH, baseH + midH]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(baseR * 0.9, 0.12, 8, 16),
      mat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  }
  // Pinnacle orb
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(baseR * 0.2, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xaabbcc, emissive: 0x445566, emissiveIntensity: 0.3 })
  );
  orb.position.y = h;
  group.add(orb);
  return group;
}

function createLavaGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const r = 4 + rng() * 5;
  const lava = new THREE.Mesh(
    new THREE.CircleGeometry(r, 24),
    new THREE.MeshStandardMaterial({
      color: 0xe85020,
      emissive: new THREE.Color(0xff6030),
      emissiveIntensity: 0.7,
      roughness: 0.8,
      metalness: 0.1
    })
  );
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = 0.04;
  lava.receiveShadow = true;
  group.add(lava);
  // Darkened rock border
  const border = new THREE.Mesh(
    new THREE.RingGeometry(r, r + 1.0, 24),
    new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.95 })
  );
  border.rotation.x = -Math.PI / 2;
  border.position.y = 0.06;
  group.add(border);
  return group;
}

function createFountainGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.6, metalness: 0.1 });
  const basinR = 1.5 + rng() * 1.0;
  // Base basin
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(basinR, basinR * 1.1, 0.6, 16, 1, true),
    mat
  );
  basin.position.y = 0.3;
  basin.castShadow = true;
  group.add(basin);
  // Central column
  const colH = 1.5 + rng() * 1.0;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, colH, 8), mat);
  col.position.y = 0.6 + colH / 2;
  col.castShadow = true;
  group.add(col);
  // Top bowl
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.4, 0.3, 12, 1, true),
    mat
  );
  bowl.position.y = 0.6 + colH + 0.15;
  group.add(bowl);
  // Water surface
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(basinR * 0.9, 16),
    new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.3, metalness: 0.15, transparent: true, opacity: 0.7 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.5;
  water.userData.tag = "environment-water";
  group.add(water);
  return group;
}

function createAltarGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 0.5, metalness: 0.2 });
  // Stone slab
  const slabW = 2.0 + rng() * 0.8;
  const slabD = 1.2 + rng() * 0.4;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.3, slabD), mat);
  slab.position.y = 1.0;
  slab.castShadow = true;
  group.add(slab);
  // Legs / supports
  for (const [lx, lz] of [[-slabW * 0.35, -slabD * 0.35], [-slabW * 0.35, slabD * 0.35], [slabW * 0.35, -slabD * 0.35], [slabW * 0.35, slabD * 0.35]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.25), mat);
    leg.position.set(lx, 0.5, lz);
    leg.castShadow = true;
    group.add(leg);
  }
  // Glowing object on top
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x88aaff, emissive: 0x4488ff, emissiveIntensity: 0.6 })
  );
  orb.position.y = 1.35;
  group.add(orb);
  return group;
}

function createShrineGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.7 });
  // Small roof structure
  const roofH = 2.5 + rng() * 1.0;
  const roofW = 2.0 + rng() * 0.6;
  // Four thin posts
  for (const [px, pz] of [[-roofW / 2, -roofW / 2], [-roofW / 2, roofW / 2], [roofW / 2, -roofW / 2], [roofW / 2, roofW / 2]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, roofH, 6), mat);
    post.position.set(px, roofH / 2, pz);
    post.castShadow = true;
    group.add(post);
  }
  // Pointed roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofW * 0.85, roofH * 0.35, 4), mat);
  roof.position.y = roofH + roofH * 0.175;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  // 16E: Stone base platform
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(roofW + 0.6, 0.2, roofW + 0.6), baseMat);
  base.position.y = 0.1;
  base.receiveShadow = true;
  group.add(base);
  // Inner object — small offering stone
  const stone = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x5a5a58, roughness: 0.8 })
  );
  stone.position.y = 0.4;
  group.add(stone);
  // 16E: Glowing lantern hanging from center
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffaa33, emissiveIntensity: 0.7, transparent: true, opacity: 0.9 })
  );
  lantern.position.y = roofH - 0.3;
  group.add(lantern);
  // 16E: Worn/broken detail — one post slightly tilted
  group.children[Math.floor(rng() * 4)].rotation.z = (rng() - 0.5) * 0.1;
  return group;
}

function createCampfireGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  // Stone ring
  const stoneCount = 6 + Math.floor(rng() * 4);
  const ringR = 0.6 + rng() * 0.3;
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.9 });
  for (let i = 0; i < stoneCount; i++) {
    const angle = (i / stoneCount) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + rng() * 0.08, 0), stoneMat);
    s.position.set(Math.cos(angle) * ringR, 0.1, Math.sin(angle) * ringR);
    group.add(s);
  }
  // Logs
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.9 })
    );
    log.position.set(0, 0.15, 0);
    log.rotation.z = Math.PI / 2 + (i - 1) * 0.6;
    log.rotation.y = i * 1.1;
    group.add(log);
  }
  // Central glow — emissive sphere for fire
  const fire = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff6020, emissive: 0xff8030, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 })
  );
  fire.position.y = 0.3;
  group.add(fire);
  return group;
}

// ── 16E: New dream-specific micro-generators ─────────────────────────

function createDeerGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const furColor = [0xb08a50, 0x8a6a3a, 0xc0a060, 0xa08048][Math.floor(rng() * 4)];
  const mat = new THREE.MeshStandardMaterial({ color: furColor, roughness: 0.8 });
  // Body — elongated, taller than generic animal
  const bodyLen = 1.0 + rng() * 0.4;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, bodyLen, 6, 10), mat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.9;
  body.castShadow = true;
  group.add(body);
  // Head — elevated
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), mat);
  head.position.set(bodyLen / 2 + 0.22, 1.1, 0);
  head.castShadow = true;
  group.add(head);
  // Snout
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), mat);
  snout.position.set(bodyLen / 2 + 0.4, 1.05, 0);
  snout.rotation.z = -Math.PI / 2;
  group.add(snout);
  // Ears — tall pointed
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), mat);
    ear.position.set(bodyLen / 2 + 0.15, 1.3, side * 0.1);
    group.add(ear);
  }
  // Antlers — branching cones (signature feature)
  const antlerMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.7 });
  for (const side of [-1, 1]) {
    // Main beam
    const beamH = 0.4 + rng() * 0.3;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, beamH, 5), antlerMat);
    beam.position.set(bodyLen / 2 + 0.12, 1.3 + beamH / 2, side * 0.08);
    beam.rotation.z = side * 0.3;
    group.add(beam);
    // Tines (2-3 branches)
    const tineCount = 2 + Math.floor(rng() * 2);
    for (let t = 0; t < tineCount; t++) {
      const tH = 0.15 + rng() * 0.2;
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.02, tH, 4), antlerMat);
      tine.position.set(
        bodyLen / 2 + 0.12 + (t + 1) * 0.06 * side,
        1.3 + beamH * (0.4 + t * 0.25),
        side * (0.1 + t * 0.04)
      );
      tine.rotation.z = side * (0.5 + t * 0.2);
      group.add(tine);
    }
  }
  // Long legs — 4
  for (const [lx, lz] of [[0.3, 0.15], [0.3, -0.15], [-0.3, 0.15], [-0.3, -0.15]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5), mat);
    leg.position.set(lx, 0.4, lz);
    leg.castShadow = true;
    group.add(leg);
  }
  // Short tail
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.12, 4),
    new THREE.MeshStandardMaterial({ color: 0xeee8d0, roughness: 0.7 })
  );
  tail.position.set(-bodyLen / 2 - 0.2, 0.95, 0);
  tail.rotation.z = 0.3;
  group.add(tail);
  group.rotation.y = rng() * Math.PI * 2;
  group.userData.livingPresence = "animal";
  return group;
}

function createGrassGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const colors = [0x3a6a28, 0x4a7a30, 0x2a5a20, 0x5a8a38, 0x3a5a22];
  const clumpCount = 6 + Math.floor(rng() * 8);
  for (let c = 0; c < clumpCount; c++) {
    const cx = (rng() - 0.5) * 4;
    const cz = (rng() - 0.5) * 4;
    const bladeCount = 5 + Math.floor(rng() * 6);
    const color = colors[Math.floor(rng() * colors.length)];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
    for (let b = 0; b < bladeCount; b++) {
      const h = 0.3 + rng() * 0.6;
      const w = 0.04 + rng() * 0.03;
      // Blade as thin box, slightly tilted
      const blade = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), mat);
      blade.position.set(cx + (rng() - 0.5) * 0.4, h / 2, cz + (rng() - 0.5) * 0.4);
      blade.rotation.y = rng() * Math.PI;
      blade.rotation.z = (rng() - 0.5) * 0.3;
      // 16F: Mark blades for sway animation
      blade.userData.swayable = true;
      group.add(blade);
    }
  }
  return group;
}

function createRuinGroup(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a7a78, roughness: 0.85 });
  // Broken walls — 2-4 partial wall segments
  const wallCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < wallCount; i++) {
    const wH = 1.5 + rng() * 3;
    const wW = 2 + rng() * 3;
    const wD = 0.3 + rng() * 0.2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wW, wH, wD), mat);
    const angle = (i / wallCount) * Math.PI * 2 + rng() * 0.5;
    const rad = 2 + rng() * 2;
    wall.position.set(Math.cos(angle) * rad, wH / 2, Math.sin(angle) * rad);
    wall.rotation.y = angle + Math.PI / 2 + (rng() - 0.5) * 0.3;
    // Broken top — slight tilt
    wall.rotation.z = (rng() - 0.5) * 0.15;
    wall.castShadow = true;
    group.add(wall);
  }
  // Broken arch — partial torus
  if (rng() > 0.3) {
    const archR = 1.5 + rng() * 1;
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(archR, 0.3, 6, 12, Math.PI * (0.5 + rng() * 0.4)),
      mat
    );
    arch.position.y = archR * 0.6;
    arch.rotation.z = Math.PI;
    arch.rotation.y = rng() * Math.PI;
    arch.castShadow = true;
    group.add(arch);
  }
  // Scattered rubble blocks
  const rubbleCount = 4 + Math.floor(rng() * 6);
  for (let i = 0; i < rubbleCount; i++) {
    const size = 0.2 + rng() * 0.5;
    const rubble = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.6, size * 0.8), mat);
    rubble.position.set((rng() - 0.5) * 6, size * 0.3, (rng() - 0.5) * 6);
    rubble.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.3);
    rubble.castShadow = true;
    group.add(rubble);
  }
  // Broken column stump
  if (rng() > 0.4) {
    const colH = 0.8 + rng() * 1.5;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, colH, 8), mat);
    col.position.set((rng() - 0.5) * 3, colH / 2, (rng() - 0.5) * 3);
    col.rotation.z = (rng() - 0.5) * 0.2;
    col.castShadow = true;
    group.add(col);
  }
  return group;
}
