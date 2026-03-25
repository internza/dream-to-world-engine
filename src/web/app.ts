import { transformDreamToWorld, generateRandomDream, getLastParseDebug } from "../core/transform.js";
import type { WorldModel, DreamProfile } from "../core/transform.js";
import { initRenderer, renderWorld, setControlsEnabled, toggleCameraMode, getCameraMode, startCinematicIntro, isCinematicActive, resetPlayerPosition, getCurrentPower, disposeWorld } from "./renderer.js";
import { startAmbient, startAmbientFadeIn, toggleMute, startWindLayer, stopWindLayer, resolveAmbientProfile } from "./audio.js";

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

// 16G: New UI elements
const helpBtn = document.getElementById("help-btn");
const resetPosBtn = document.getElementById("reset-pos-btn");
const regenBtn = document.getElementById("regen-btn");
const onboardingCard = document.getElementById("onboarding-card");
const recentDreamsEl = document.getElementById("recent-dreams");
const powerBar = document.getElementById("power-bar");
const dreamTitleText = document.getElementById("dream-title-text");
const dreamTitleSub = document.getElementById("dream-title-sub");

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
let lastDreamText = "";

// ── 16G: Onboarding state ────────────────────────────────────────────
let onboardingShown = false;
let onboardingAutoHide: number | null = null;

function hideOnboarding(): void {
  if (onboardingCard) {
    onboardingCard.style.opacity = "0";
    setTimeout(() => { onboardingCard!.style.display = "none"; }, 400);
  }
  if (onboardingAutoHide !== null) {
    clearTimeout(onboardingAutoHide);
    onboardingAutoHide = null;
  }
}

// ── 16G: Recent dreams chip rendering ────────────────────────────────
function renderRecentDreams(): void {
  if (!recentDreamsEl) return;
  const history = loadDreamHistory();
  const recent = history.slice(-5).reverse();
  recentDreamsEl.innerHTML = "";
  if (!recent.length) return;
  for (const entry of recent) {
    const chip = document.createElement("button");
    chip.className = "recent-dream-chip";
    chip.textContent = entry.dream.length > 40 ? entry.dream.slice(0, 37) + "\u2026" : entry.dream;
    chip.title = entry.dream;
    chip.addEventListener("click", () => {
      if (input) input.value = entry.dream;
      generateWorldWithMemory(entry.dream);
    });
    recentDreamsEl.appendChild(chip);
  }
}

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

  // ── Step 1: Fade screen to black ──────────────────────────────────
  showGenerationOverlay();
  if (canvasWrap) {
    canvasWrap.style.transition = "opacity 0.5s ease";
    canvasWrap.style.opacity = "0";
  }
  await new Promise((r) => setTimeout(r, 550));

  // ── Step 2: Generate world (hidden behind black overlay) ──────────
  const world = getCachedWorld(sanitized);
  if (output) output.textContent = JSON.stringify(world, null, 2);
  renderWorld(world);

  const profile = resolveAmbientProfile(world);
  if (profile.primary === "night") {
    startWindLayer();
  } else {
    stopWindLayer();
  }

  updateDreamStatus(sanitized, world.semantics.environment);

  // ── Step 3: Reveal canvas + start cinematic fly-in ────────────────
  hideGenerationOverlay();
  if (canvasWrap) {
    canvasWrap.style.transition = "opacity 0.8s ease-out";
    canvasWrap.style.opacity = "1";
  }

  // 16G: Show dream title overlay during cinematic
  const dreamTitleEl = document.getElementById("dream-title-overlay");
  if (dreamTitleEl) {
    if (dreamTitleText) {
      dreamTitleText.textContent = sanitized.length > 120 ? sanitized.slice(0, 117) + "\u2026" : sanitized;
    }
    if (dreamTitleSub) {
      const env = world.semantics.environment || "";
      const mood = world.semantics.mood || "";
      const parts = [env, mood].filter(Boolean);
      dreamTitleSub.textContent = parts.length ? parts.join(" \u00B7 ") : "";
    }
    dreamTitleEl.style.transition = "opacity 0.8s ease-in";
    dreamTitleEl.style.opacity = "1";
  }

  // Start ambient audio with fade-in during cinematic
  startAmbientFadeIn(world, 2.5);

  // Cinematic fly-in: camera sweeps from above to ground spawn
  await new Promise<void>((resolve) => {
    startCinematicIntro(() => {
      resolve();
    });
  });

  // 16G: Fade out dream title after cinematic
  if (dreamTitleEl) {
    dreamTitleEl.style.transition = "opacity 1.2s ease-out";
    dreamTitleEl.style.opacity = "0";
  }

  // ── Step 4: Enable controls ───────────────────────────────────────
  setControlsEnabled(true);

  // Show controls hint briefly
  const hint = document.getElementById("controls-hint");
  if (hint) {
    hint.style.opacity = "1";
    hint.style.transition = "opacity 2s ease";
    setTimeout(() => { hint.style.opacity = "0.4"; }, 3000);
  }

  // 16G: Show onboarding card on first entry
  if (onboardingCard && !onboardingShown) {
    onboardingShown = true;
    onboardingCard.style.display = "block";
    setTimeout(() => { onboardingCard!.style.opacity = "1"; }, 50);
    // Auto-hide after 6s
    onboardingAutoHide = window.setTimeout(() => {
      hideOnboarding();
    }, 6000);
  }

  // 16G: Show power bar
  if (powerBar) powerBar.classList.add("is-visible");

  // 16G: Update recent dreams chips
  renderRecentDreams();

  lastDreamText = sanitized;
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
    muteBtn.textContent = nowMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A";
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

// ── 16G: Demo toolbar handlers ───────────────────────────────────────
if (helpBtn) {
  helpBtn.addEventListener("click", () => {
    if (!onboardingCard) return;
    const visible = onboardingCard.style.display === "block";
    if (visible) {
      hideOnboarding();
    } else {
      onboardingCard.style.display = "block";
      setTimeout(() => { onboardingCard!.style.opacity = "1"; }, 50);
    }
  });
}

if (resetPosBtn) {
  resetPosBtn.addEventListener("click", () => {
    resetPlayerPosition();
  });
}

if (regenBtn) {
  regenBtn.addEventListener("click", () => {
    const text = lastDreamText || (input ? input.value.trim() : "");
    if (text) generateWorldWithMemory(text);
  });
}

// Hide onboarding on canvas click (pointer lock request)
if (canvas) {
  canvas.addEventListener("click", () => {
    if (onboardingCard && onboardingCard.style.display === "block") {
      hideOnboarding();
    }
  });
}

// ── Dream Memory (Scope H) ───────────────────────────────────────────
const DREAM_HISTORY_KEY = "dtwe_dream_history";
const MAX_HISTORY = 50;

interface DreamHistoryEntry {
  dream: string;
  environment: string;
  timestamp: number;
  profile?: DreamProfile;
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

function saveDreamToHistory(dream: string, environment: string, profile?: DreamProfile): void {
  try {
    const history = loadDreamHistory();
    // Avoid exact duplicates of the most recent entry
    if (history.length > 0 && history[history.length - 1].dream === dream) return;
    history.push({ dream, environment, timestamp: Date.now(), profile });
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    localStorage.setItem(DREAM_HISTORY_KEY, JSON.stringify(history));
  } catch { /* localStorage may be unavailable */ }
}

// ── 15F: Dream similarity — find past dreams with overlapping keywords ──
function findSimilarDreams(profile: DreamProfile, maxResults = 3): DreamHistoryEntry[] {
  const history = loadDreamHistory();
  if (!profile.keywords.length) return [];
  const keywordSet = new Set(profile.keywords);
  const scored: Array<{ entry: DreamHistoryEntry; score: number }> = [];
  for (const entry of history) {
    if (!entry.profile?.keywords) continue;
    let overlap = 0;
    for (const kw of entry.profile.keywords) {
      if (keywordSet.has(kw)) overlap++;
    }
    if (entry.profile.palette === profile.palette) overlap += 0.5;
    if (entry.profile.tone === profile.tone) overlap += 0.5;
    if (overlap > 0) scored.push({ entry, score: overlap });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map((s) => s.entry);
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
      saveDreamToHistory(sanitized, world.semantics.environment, world.dreamProfile);
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

  // 15F: Show dream profile and similar dreams
  const lastDream = input?.value?.trim() || "";
  if (lastDream) {
    const lastWorld = dreamCache.get(lastDream.toLowerCase().trim());
    if (lastWorld?.dreamProfile) {
      const dp = lastWorld.dreamProfile;
      lines.push(`<b>Dream Profile:</b>`);
      lines.push(`&nbsp;&nbsp;palette: ${dp.palette}, tone: ${dp.tone}`);
      lines.push(`&nbsp;&nbsp;layout: ${dp.layout}, coherence: ${dp.coherence.toFixed(2)}`);
      lines.push(`&nbsp;&nbsp;keywords: ${dp.keywords.join(", ")}`);
      const similar = findSimilarDreams(dp, 3);
      if (similar.length > 0) {
        lines.push(`<b>Similar past dreams:</b>`);
        for (const s of similar) {
          lines.push(`&nbsp;&nbsp;${escapeHtml(s.dream.slice(0, 60))}`);
        }
      }
    }
  }

  debugPanel.innerHTML = lines.join("<br>");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
