import type { WorldModel } from "../core/transform.js";
import type { SurfaceType } from "./surface.js";

type AmbientCategory = "ocean" | "forest" | "city" | "night" | "rain" | "wind" | "cave" | "desert" | "frozen" | "celestial";

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeSources: AudioBufferSourceNode[] = [];
let muted = false;

// --- Footstep state ---
let footstepSurface: SurfaceType = "generic";
let footstepDistance = 0;
let footstepInterval = 0.48;

export function resolveAmbientProfile(world: WorldModel): { primary: AmbientCategory; secondary: AmbientCategory | null } {
  const names = new Set(world.entities.map((e) => e.attributes.name));

  if (names.has("ocean") || names.has("sea") || names.has("beach") || names.has("lake") || names.has("harbor") || names.has("reef")) {
    return { primary: "ocean", secondary: names.has("rain") || names.has("rainy") ? "rain" : null };
  }
  if (names.has("forest") || names.has("jungle") || names.has("garden") || names.has("marsh")) {
    return { primary: "forest", secondary: names.has("rain") || names.has("rainy") ? "rain" : null };
  }
  if (names.has("city") || names.has("street") || names.has("village") || names.has("bazaar")) {
    return { primary: "city", secondary: names.has("rain") || names.has("rainy") ? "rain" : null };
  }
  if (names.has("cave") || names.has("crypt") || names.has("dungeon") || names.has("underground")) {
    return { primary: "cave", secondary: null };
  }
  if (names.has("desert") || names.has("oasis")) {
    return { primary: "desert", secondary: names.has("wind") ? "wind" : null };
  }
  if (names.has("glacier") || names.has("tundra") || names.has("frozen") || names.has("snow") || names.has("snowy")) {
    return { primary: "frozen", secondary: "wind" };
  }
  if (names.has("space") || names.has("cosmos") || names.has("nebula") || names.has("dreamscape") || names.has("realm")) {
    return { primary: "celestial", secondary: null };
  }
  if (names.has("rain") || names.has("rainy") || names.has("storm") || names.has("thunder")) {
    return { primary: "rain", secondary: null };
  }
  return { primary: "night", secondary: null };
}

function ensureContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function addFilteredNoise(
  ctx: AudioContext,
  dest: AudioNode,
  type: BiquadFilterType,
  freq: number,
  gain: number,
  q?: number
): void {
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 3);
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  if (q !== undefined) filter.Q.value = q;

  const vol = ctx.createGain();
  vol.gain.value = gain;

  src.connect(filter);
  filter.connect(vol);
  vol.connect(dest);
  src.start();
  activeSources.push(src);
}

function buildLayer(ctx: AudioContext, dest: AudioNode, cat: AmbientCategory, volume: number): void {
  switch (cat) {
    case "ocean":
      addFilteredNoise(ctx, dest, "lowpass", 400, volume * 0.08);
      addFilteredNoise(ctx, dest, "bandpass", 800, volume * 0.04, 1);
      break;
    case "forest":
      addFilteredNoise(ctx, dest, "bandpass", 2500, volume * 0.04, 0.5);
      addFilteredNoise(ctx, dest, "lowpass", 500, volume * 0.025);
      break;
    case "city":
      addFilteredNoise(ctx, dest, "lowpass", 200, volume * 0.06);
      addFilteredNoise(ctx, dest, "bandpass", 120, volume * 0.03, 4);
      break;
    case "rain":
      addFilteredNoise(ctx, dest, "highpass", 2000, volume * 0.06);
      addFilteredNoise(ctx, dest, "bandpass", 4000, volume * 0.03, 0.8);
      break;
    case "wind":
      addFilteredNoise(ctx, dest, "bandpass", 500, volume * 0.05, 0.8);
      break;
    case "cave":
      addFilteredNoise(ctx, dest, "lowpass", 150, volume * 0.03);
      addFilteredNoise(ctx, dest, "bandpass", 300, volume * 0.015, 3);
      break;
    case "desert":
      addFilteredNoise(ctx, dest, "bandpass", 400, volume * 0.025, 1.2);
      addFilteredNoise(ctx, dest, "lowpass", 100, volume * 0.01);
      break;
    case "frozen":
      addFilteredNoise(ctx, dest, "bandpass", 600, volume * 0.04, 0.6);
      addFilteredNoise(ctx, dest, "highpass", 3000, volume * 0.015);
      break;
    case "celestial":
      addFilteredNoise(ctx, dest, "bandpass", 250, volume * 0.02, 4);
      addFilteredNoise(ctx, dest, "bandpass", 1000, volume * 0.01, 6);
      break;
    case "night":
    default:
      addFilteredNoise(ctx, dest, "bandpass", 200, volume * 0.02, 2);
      addFilteredNoise(ctx, dest, "lowpass", 100, volume * 0.015);
      break;
  }
}

export function startAmbient(world: WorldModel): void {
  const ctx = ensureContext();

  // Crossfade: fade out old sources then replace
  if (masterGain && audioCtx && activeSources.length > 0) {
    const oldSources = [...activeSources];
    const fadeGain = ctx.createGain();
    fadeGain.gain.setValueAtTime(1, ctx.currentTime);
    fadeGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    fadeGain.connect(ctx.destination);
    // Disconnect old sources after fade
    setTimeout(() => {
      oldSources.forEach((src) => {
        try { src.stop(); } catch { /* ok */ }
        try { src.disconnect(); } catch { /* ok */ }
      });
    }, 600);
    activeSources = [];
  } else {
    stopAmbient();
  }

  if (!masterGain) return;

  const profile = resolveAmbientProfile(world);
  buildLayer(ctx, masterGain, profile.primary, 1);
  if (profile.secondary) {
    buildLayer(ctx, masterGain, profile.secondary, 0.5);
  }
}

/**
 * Start ambient audio with a smooth fade-in over the given duration (seconds).
 * Used by the cinematic intro to gradually bring sound in.
 */
export function startAmbientFadeIn(world: WorldModel, fadeDuration: number = 2): void {
  const ctx = ensureContext();
  stopAmbient();

  if (!masterGain) return;

  // Temporarily silence master, build layers, then ramp up
  const prevGain = muted ? 0 : 1;
  masterGain.gain.setValueAtTime(0, ctx.currentTime);

  const profile = resolveAmbientProfile(world);
  buildLayer(ctx, masterGain, profile.primary, 1);
  if (profile.secondary) {
    buildLayer(ctx, masterGain, profile.secondary, 0.5);
  }

  // Smooth fade-in
  masterGain.gain.linearRampToValueAtTime(prevGain, ctx.currentTime + fadeDuration);
}

export function stopAmbient(): void {
  activeSources.forEach((src) => {
    try { src.stop(); } catch { /* already stopped */ }
    try { src.disconnect(); } catch { /* already disconnected */ }
  });
  activeSources = [];
}

export function toggleMute(): boolean {
  muted = !muted;
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(muted ? 0 : 1, audioCtx.currentTime, 0.1);
  }
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

// --------------- Footstep System ---------------

const FOOTSTEP_PARAMS: Record<SurfaceType, { freq: number; decay: number; filterFreq: number; filterQ: number; volume: number }> = {
  sand:    { freq: 120, decay: 0.08, filterFreq: 600,  filterQ: 0.5, volume: 0.12 },
  grass:   { freq: 180, decay: 0.06, filterFreq: 1200, filterQ: 0.8, volume: 0.10 },
  stone:   { freq: 350, decay: 0.04, filterFreq: 3000, filterQ: 1.2, volume: 0.15 },
  ice:     { freq: 400, decay: 0.03, filterFreq: 4000, filterQ: 1.5, volume: 0.14 },
  mud:     { freq: 100, decay: 0.10, filterFreq: 400,  filterQ: 0.4, volume: 0.11 },
  marble:  { freq: 380, decay: 0.03, filterFreq: 3500, filterQ: 1.4, volume: 0.14 },
  crystal: { freq: 500, decay: 0.02, filterFreq: 5000, filterQ: 2.0, volume: 0.10 },
  void:    { freq: 150, decay: 0.12, filterFreq: 300,  filterQ: 0.3, volume: 0.06 },
  generic: { freq: 200, decay: 0.05, filterFreq: 1500, filterQ: 0.7, volume: 0.11 }
};

export function setFootstepSurface(surface: SurfaceType, interval: number): void {
  footstepSurface = surface;
  footstepInterval = interval;
}

export function accumulateFootstep(moveDist: number): void {
  if (muted || !audioCtx || !masterGain) return;
  footstepDistance += moveDist;
  if (footstepDistance >= footstepInterval) {
    footstepDistance -= footstepInterval;
    playFootstep();
  }
}

export function resetFootstepAccumulator(): void {
  footstepDistance = 0;
}

function playFootstep(): void {
  if (!audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const params = FOOTSTEP_PARAMS[footstepSurface];

  // Short noise burst shaped by envelope + filter
  const length = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  // Slight random pitch variation per step
  filter.frequency.value = params.filterFreq * (0.85 + Math.random() * 0.3);
  filter.Q.value = params.filterQ;

  const gain = ctx.createGain();
  const vol = params.volume * (0.8 + Math.random() * 0.4);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + params.decay);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start();
  src.stop(ctx.currentTime + params.decay + 0.01);
}

// --------------- Wind Layer (Scope E) ---------------

let windSource: AudioBufferSourceNode | null = null;

export function startWindLayer(): void {
  if (!audioCtx || !masterGain) return;
  stopWindLayer();
  const ctx = audioCtx;

  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 4);
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 350;
  filter.Q.value = 0.6;

  const vol = ctx.createGain();
  vol.gain.value = 0.015;

  src.connect(filter);
  filter.connect(vol);
  vol.connect(masterGain);
  src.start();
  windSource = src;
}

export function stopWindLayer(): void {
  if (windSource) {
    try { windSource.stop(); } catch { /* ok */ }
    try { windSource.disconnect(); } catch { /* ok */ }
    windSource = null;
  }
}

// --------------- Interaction Sound ---------------

export function playInteractionSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;

  // Soft chime: short sine tone with fast decay
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

// --------------- 16D: Power Sound Effects ---------------

// 16E: Sustained laser loop
let laserLoopOsc: OscillatorNode | null = null;
let laserLoopGain: GainNode | null = null;
let laserLoopNoise: AudioBufferSourceNode | null = null;
let laserLoopNoiseGain: GainNode | null = null;

export function startLaserLoop(): void {
  if (muted || laserLoopOsc) return;
  const ctx = ensureContext();
  if (!masterGain) return;
  // Steady buzz: sawtooth at low frequency + filtered noise
  laserLoopOsc = ctx.createOscillator();
  laserLoopOsc.type = "sawtooth";
  laserLoopOsc.frequency.value = 180;
  laserLoopGain = ctx.createGain();
  laserLoopGain.gain.value = 0.06;
  laserLoopOsc.connect(laserLoopGain);
  laserLoopGain.connect(masterGain);
  laserLoopOsc.start();
  // Noise layer
  laserLoopNoise = ctx.createBufferSource();
  const nBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = nBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1);
  laserLoopNoise.buffer = nBuf;
  laserLoopNoise.loop = true;
  const nFilter = ctx.createBiquadFilter();
  nFilter.type = "bandpass";
  nFilter.frequency.value = 2000;
  nFilter.Q.value = 3;
  laserLoopNoiseGain = ctx.createGain();
  laserLoopNoiseGain.gain.value = 0.03;
  laserLoopNoise.connect(nFilter);
  nFilter.connect(laserLoopNoiseGain);
  laserLoopNoiseGain.connect(masterGain);
  laserLoopNoise.start();
}

export function stopLaserLoop(): void {
  if (laserLoopOsc) {
    try { laserLoopOsc.stop(); } catch { /* ok */ }
    try { laserLoopOsc.disconnect(); } catch { /* ok */ }
    laserLoopOsc = null;
  }
  if (laserLoopGain) { try { laserLoopGain.disconnect(); } catch { /* ok */ } laserLoopGain = null; }
  if (laserLoopNoise) {
    try { laserLoopNoise.stop(); } catch { /* ok */ }
    try { laserLoopNoise.disconnect(); } catch { /* ok */ }
    laserLoopNoise = null;
  }
  if (laserLoopNoiseGain) { try { laserLoopNoiseGain.disconnect(); } catch { /* ok */ } laserLoopNoiseGain = null; }
}

export function playLaserFireSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  // Sharp zap: descending sawtooth burst
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(1800, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.2);
}

export function playLaserHitSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  // Impact crackle: noise burst + low thud
  const noise = ctx.createBufferSource();
  const noiseLen = Math.floor(ctx.sampleRate * 0.1);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen);
  noise.buffer = noiseBuf;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.08, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  noise.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(t);
  noise.stop(t + 0.12);
  // Low thud
  const thud = ctx.createOscillator();
  thud.type = "sine";
  thud.frequency.setValueAtTime(80, t);
  thud.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.1, t);
  thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  thud.connect(thudGain);
  thudGain.connect(masterGain);
  thud.start(t);
  thud.stop(t + 0.15);
}

export function playDestructionSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  // Deep boom + crunch
  const boom = ctx.createOscillator();
  boom.type = "sine";
  boom.frequency.setValueAtTime(60, t);
  boom.frequency.exponentialRampToValueAtTime(25, t + 0.3);
  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(0.15, t);
  boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  boom.connect(boomGain);
  boomGain.connect(masterGain);
  boom.start(t);
  boom.stop(t + 0.4);
  // Crunch noise
  const noise = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  noise.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2000;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.1, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(t);
  noise.stop(t + 0.3);
}

export function playShockwaveSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  // Whomp: fast sweep down
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(300, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.14, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.35);
}

export function playTelekinesisGrabSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  // Ascending hum
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(660, t + 0.2);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.3);
}

export function playTelekinesisThrowSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  // Whoosh: noise sweep
  const noise = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * 0.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
  noise.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(800, t);
  filter.frequency.exponentialRampToValueAtTime(3000, t + 0.15);
  filter.Q.value = 2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(t);
  noise.stop(t + 0.25);
}

// ── 16F: Environmental event sounds ─────────────────────────────────

export function playBellTollSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  // Rich bell tone: fundamental + overtone
  for (const [freq, vol] of [[220, 0.06], [550, 0.03], [880, 0.015]] as [number, number][]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 2);
  }
}

export function playThunderSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  // Low rumble noise burst
  const noise = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * 1.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
  noise.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 200;
  filter.Q.value = 1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(t);
  noise.stop(t + 1.5);
}

export function playDustBurstSound(): void {
  if (muted || !audioCtx || !masterGain) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  // Soft whoosh of dust
  const noise = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * 0.3);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
  noise.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 600;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.04, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(t);
  noise.stop(t + 0.3);
}
