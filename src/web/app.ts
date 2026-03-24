import { transformDreamToWorld, generateRandomDream, getLastParseDebug } from "../core/transform.js";
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

// ── Dream Memory (Scope H) ───────────────────────────────────────────
const DREAM_HISTORY_KEY = "dtwe_dream_history";
const MAX_HISTORY = 50;

interface DreamHistoryEntry {
  dream: string;
  environment: string;
  timestamp: number;
}

function loadDreamHistory(): DreamHistoryEntry[] {
  try {
    const raw = localStorage.getItem(DREAM_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveDreamToHistory(dream: string, environment: string): void {
  try {
    const history = loadDreamHistory();
    // Avoid exact duplicates of the most recent entry
    if (history.length > 0 && history[history.length - 1].dream === dream) return;
    history.push({ dream, environment, timestamp: Date.now() });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    localStorage.setItem(DREAM_HISTORY_KEY, JSON.stringify(history));
  } catch { /* localStorage may be unavailable */ }
}

// Concept frequency — counts how often each canonical concept appears across dreams
const CONCEPT_FREQ_KEY = "dtwe_concept_freq";

function updateConceptFrequency(world: WorldModel): void {
  try {
    const raw = localStorage.getItem(CONCEPT_FREQ_KEY);
    const freq: Record<string, number> = raw ? JSON.parse(raw) : {};
    for (const entity of world.entities) {
      const name = entity.attributes.name;
      freq[name] = (freq[name] || 0) + 1;
    }
    localStorage.setItem(CONCEPT_FREQ_KEY, JSON.stringify(freq));
  } catch { /* ok */ }
}

// Hook memory into generation pipeline
const _origGetCachedWorld = getCachedWorld;
function getCachedWorldWithMemory(dream: string): WorldModel {
  const world = _origGetCachedWorld(dream);
  return world;
}

// Patch generateWorld to save history
const _origGenerate = generateWorld;
async function generateWorldWithMemory(dreamText: string): Promise<void> {
  await _origGenerate(dreamText);
  const sanitized = sanitizeDreamInput(dreamText);
  if (sanitized) {
    const world = dreamCache.get(sanitized.toLowerCase().trim());
    if (world) {
      saveDreamToHistory(sanitized, world.semantics.environment);
      updateConceptFrequency(world);
      updateDebugPanel();
    }
  }
}

// Re-wire event handlers to use memory-enhanced generation
button.removeEventListener("click", () => {});
button.addEventListener("click", () => {
  generateWorldWithMemory(input.value.trim());
});

// ── Debug Panel (Scope I) ────────────────────────────────────────────
const debugEnabled = new URLSearchParams(window.location.search).has("debug");

function createDebugPanel(): HTMLElement | null {
  if (!debugEnabled) return null;
  const panel = document.createElement("div");
  panel.id = "debug-panel";
  panel.style.cssText = `
    position: fixed; bottom: 0; right: 0; width: 360px; max-height: 40vh;
    overflow-y: auto; background: rgba(0,0,0,0.85); color: #aaffaa;
    font: 11px/1.5 monospace; padding: 8px 12px; z-index: 9999;
    border-top-left-radius: 6px; pointer-events: auto;
  `;
  panel.innerHTML = "<strong>Debug Panel (Iter 16)</strong><br><em>Generate a dream to see parse info</em>";
  document.body.appendChild(panel);
  return panel;
}

const debugPanel = createDebugPanel();

function updateDebugPanel(): void {
  if (!debugPanel) return;
  const info = getLastParseDebug();
  if (!info) {
    debugPanel.innerHTML = "<strong>Debug Panel</strong><br><em>No parse data yet</em>";
    return;
  }

  const lines: string[] = [];
  lines.push("<strong>Debug Panel (Iter 16)</strong>");
  lines.push(`<b>Tokens:</b>`);
  for (const t of info.tokens) {
    lines.push(`&nbsp;&nbsp;${escapeHtml(t.original)} → ${escapeHtml(t.canonical)} [${t.type}]`);
  }
  lines.push(`<b>Families:</b>`);
  for (const f of info.generatorFamilies) {
    lines.push(`&nbsp;&nbsp;${escapeHtml(f.name)} → ${f.family}`);
  }
  lines.push(`<b>Semantics:</b>`);
  if (info.semantics) {
    for (const [k, v] of Object.entries(info.semantics)) {
      if (v) lines.push(`&nbsp;&nbsp;${k}: ${v}`);
    }
  }
  // Show concept frequency from localStorage
  try {
    const raw = localStorage.getItem(CONCEPT_FREQ_KEY);
    if (raw) {
      const freq = JSON.parse(raw) as Record<string, number>;
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (sorted.length) {
        lines.push(`<b>Top concepts:</b>`);
        for (const [name, count] of sorted) {
          lines.push(`&nbsp;&nbsp;${name}: ${count}`);
        }
      }
    }
  } catch { /* ok */ }
  // Dream history count
  const history = loadDreamHistory();
  lines.push(`<b>Dream history:</b> ${history.length} entries`);

  debugPanel.innerHTML = lines.join("<br>");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
