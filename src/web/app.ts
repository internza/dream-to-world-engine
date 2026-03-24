import { transformDreamToWorld, generateRandomDream } from "../core/transform.js";
import type { WorldModel } from "../core/transform.js";
import { initRenderer, renderWorld, setControlsEnabled, toggleCameraMode, getCameraMode } from "./renderer.js";
import { startAmbient, toggleMute, startWindLayer, stopWindLayer, resolveAmbientProfile } from "./audio.js";

const input = document.querySelector<HTMLTextAreaElement>("#dream-input");
const button = document.querySelector<HTMLButtonElement>("#generate-btn");
const randomBtn = document.querySelector<HTMLButtonElement>("#random-btn");
const output = document.querySelector<HTMLPreElement>("#output");
const canvas = document.querySelector<HTMLCanvasElement>("#world-canvas");
const muteBtn = document.querySelector<HTMLButtonElement>("#mute-btn");
const cameraToggleBtn = document.querySelector<HTMLButtonElement>("#camera-toggle-btn");
const canvasWrap = document.querySelector<HTMLElement>(".canvas-wrap");
const dreamStatus = document.getElementById("dream-status");
const generationOverlay = document.getElementById("generation-overlay");

if (!input || !button || !output || !canvas) {
  throw new Error("Missing required elements");
}

initRenderer(canvas);

// ── Dream memoization cache ──────────────────────────────────────────
const dreamCache = new Map<string, WorldModel>();
const CACHE_MAX = 20;

function getCachedWorld(dream: string): WorldModel {
  const key = dream.toLowerCase().trim();
  const cached = dreamCache.get(key);
  if (cached) return cached;

  const world = transformDreamToWorld(dream);
  if (dreamCache.size >= CACHE_MAX) {
    const firstKey = dreamCache.keys().next().value;
    if (firstKey !== undefined) dreamCache.delete(firstKey);
  }
  dreamCache.set(key, world);
  return world;
}

// ── Generation overlay ───────────────────────────────────────────────
function showGenerationOverlay(): void {
  if (generationOverlay) generationOverlay.style.display = "flex";
}

function hideGenerationOverlay(): void {
  if (generationOverlay) generationOverlay.style.display = "none";
}

// ── Status display ───────────────────────────────────────────────────
function updateDreamStatus(dream: string, env: string): void {
  if (dreamStatus) {
    dreamStatus.textContent = `"${dream.length > 80 ? dream.slice(0, 77) + "..." : dream}" — ${env}`;
  }
}

// ── Edge case: sanitize input ────────────────────────────────────────
function sanitizeDreamInput(raw: string): string {
  let text = raw.trim();
  // Empty input → generate a fallback
  if (!text) return "";
  // Limit to reasonable length (prevent complexity explosion)
  if (text.length > 300) text = text.slice(0, 300);
  return text;
}

let isGenerating = false;

// ── Core generation logic ────────────────────────────────────────────
async function generateWorld(dreamText: string): Promise<void> {
  const sanitized = sanitizeDreamInput(dreamText);

  if (!sanitized) {
    // Empty → generate a random dream as fallback
    const fallback = generateRandomDream();
    if (input) input.value = fallback;
    await generateWorld(fallback);
    return;
  }

  if (isGenerating) return;
  isGenerating = true;

  setControlsEnabled(false);

  // Show loading overlay (fade to darker)
  showGenerationOverlay();
  if (canvasWrap) {
    canvasWrap.style.transition = "opacity 0.3s ease";
    canvasWrap.style.opacity = "0.6";
  }

  // Small delay so overlay renders before heavy work
  await new Promise((r) => setTimeout(r, 80));

  const world = getCachedWorld(sanitized);
  if (output) output.textContent = JSON.stringify(world, null, 2);
  renderWorld(world);
  startAmbient(world);

  const profile = resolveAmbientProfile(world);
  if (profile.primary === "night") {
    startWindLayer();
  } else {
    stopWindLayer();
  }

  updateDreamStatus(sanitized, world.semantics.environment);

  // Cinematic fade-in
  if (canvasWrap) {
    canvasWrap.style.transition = "opacity 1.2s ease-out";
    canvasWrap.style.opacity = "0";
    void canvasWrap.offsetHeight;
    canvasWrap.style.opacity = "1";
  }

  hideGenerationOverlay();

  // Camera intro delay — controls disabled for cinematic entrance
  await new Promise((r) => setTimeout(r, 900));
  setControlsEnabled(true);
  isGenerating = false;
}

// ── Event handlers ───────────────────────────────────────────────────
input.addEventListener("focus", () => setControlsEnabled(false));

// Enter key triggers generation (Shift+Enter for newline)
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    generateWorld(input.value.trim());
  }
});

if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    const nowMuted = toggleMute();
    muteBtn.textContent = nowMuted ? "Unmute" : "Mute";
    muteBtn.classList.toggle("is-active", nowMuted);
  });
}

if (cameraToggleBtn) {
  cameraToggleBtn.addEventListener("click", () => {
    toggleCameraMode();
    const mode = getCameraMode();
    cameraToggleBtn.textContent = mode === "first" ? "Camera: 1st" : "Camera: 3rd";
  });
}

button.addEventListener("click", () => {
  generateWorld(input.value.trim());
});

if (randomBtn) {
  randomBtn.addEventListener("click", () => {
    const dream = generateRandomDream();
    input.value = dream;
    generateWorld(dream);
  });
}

// No auto-generation on load — wait for user input
