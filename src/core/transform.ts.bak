import { canonicalizeToken } from "./knowledge.js";

export type EntityType = "place" | "object" | "descriptor" | "unknown";
export type RelationType = "modifies" | "located_in" | "above";

export interface WorldEntity {
  id: string;
  type: EntityType;
  attributes: { name: string };
}

export interface WorldModel {
  entities: WorldEntity[];
  relationships: WorldRelation[];
  semantics: SemanticTags;
}

export type EnvironmentType = "ocean" | "forest" | "city" | "sky" | "void" | "mountain" | "desert" | "generic";
export type MoodType = "calm" | "dark" | "dreamlike" | "chaotic" | "mystical";
export type TimeOfDay = "day" | "sunset" | "night";
export type WeatherType = "clear" | "cloudy" | "rain" | "storm" | "snow";
export type ScaleType = "normal" | "giant" | "tiny" | "endless";

export interface SemanticTags {
  environment: EnvironmentType;
  mood: MoodType;
  time: TimeOfDay;
  weather: WeatherType;
  scale: ScaleType;
}

export interface WorldRelation {
  id: string;
  type: RelationType;
  from: string;
  to: string;
}

// ── Debug type for parser diagnostics ─────────────────────────────────
export interface TokenDebug {
  original: string;
  canonical: string;
  type: EntityType;
}

const STOPWORDS = new Set([
  "i", "am", "is", "are", "was", "were", "a", "an", "the",
  "and", "or", "but", "at", "in", "on", "of", "to", "with",
  "above", "below", "under", "beside", "near", "into", "through",
  "across", "between", "over", "around", "from", "that", "there",
  "here", "some", "my", "their", "its", "very", "been", "like",
  "than", "then", "not", "so", "just", "all", "it", "up", "down",
  "out", "had", "has", "have", "would", "could", "should"
]);

// Structural words used for relationship inference – not removed during
// tokenization so that we can detect "above", "under", "in", "at".
const RELATION_WORDS = new Set(["above", "below", "under", "in", "at"]);

// Conjunctions / prepositions that break noun phrases but don't become entities.
const PHRASE_BREAKERS = new Set(["and", "or", "with", "but"]);

export function normalizeDream(dream: string): string {
  return dream
    .toLowerCase()
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not");
}

export function tokenizeDream(dream: string): string[] {
  const normalized = normalizeDream(dream);
  const matches = normalized.match(/[a-z]+/g);
  if (!matches) return [];

  return matches.filter((word) => !STOPWORDS.has(word));
}

// Legacy classifier kept as fallback when knowledge base doesn't know a token.
export function classifyWord(word: string): EntityType {
  const places = [
    "beach", "city", "forest", "desert", "ocean", "mountain",
    "space", "room", "street", "house", "clouds", "castle",
    "garden", "cave", "lake", "river", "island", "village",
    "temple", "sea", "field", "valley", "jungle", "palace",
    "sky", "void", "realm", "cliff", "canyon"
  ];
  const objects = [
    "tower", "towers", "ship", "car", "door", "tree", "trees",
    "building", "buildings", "stone", "stones", "fragment", "fragments",
    "crystal", "crystals", "ruins", "ruin", "rock", "rocks",
    "bridge", "bridges", "wall", "walls", "gate", "gates",
    "statue", "statues", "pillar", "pillars", "column", "columns",
    "orb", "throne", "altar", "sword", "monument", "lantern",
    "lamp", "spire", "spires"
  ];
  const descriptors = [
    "floating", "jacked", "dark", "bright", "glowing", "ruined",
    "ancient", "futuristic", "glass", "quiet", "giant", "endless",
    "neon", "purple", "golden", "silver", "deep", "vast", "tall",
    "broken", "magical", "ethereal", "hidden", "massive", "sacred",
    "luminous", "shadowy", "misty", "frozen", "burning", "enchanted",
    "spectral", "lost", "small", "rain", "rainy",
    "storm", "stormy", "thunder", "snow", "snowy",
    "night", "moon", "stars", "starry", "sun", "sunny",
    "sunset", "dusk", "dawn", "surreal", "mystical", "dreamlike", "cosmic"
  ];

  if (places.includes(word)) return "place";
  if (objects.includes(word)) return "object";
  if (descriptors.includes(word)) return "descriptor";

  return "unknown";
}

// ── Canonicalize + classify a token via knowledge base, with fallback ─
function resolveToken(raw: string): { canonical: string; type: EntityType } {
  const kb = canonicalizeToken(raw);
  if (kb.type) {
    return { canonical: kb.canonical, type: kb.type };
  }
  // Knowledge base didn't know it — fall back to legacy classifier
  const legacy = classifyWord(raw);
  if (legacy !== "unknown") {
    return { canonical: raw, type: legacy };
  }
  // Try classifying the canonical form too (handles plural stripping etc.)
  const legacyCanonical = classifyWord(kb.canonical);
  return { canonical: kb.canonical, type: legacyCanonical };
}

// ── Phrase grouping helpers ───────────────────────────────────────────
// After canonicalization, we walk the token stream and group descriptor
// stacks that precede a noun. Each descriptor in the stack will point to
// that noun via a "modifies" relationship.

interface CanonToken {
  raw: string;
  canonical: string;
  type: EntityType;
  /** Index in the original allTokens array */
  sourceIndex: number;
}

function buildCanonTokens(allTokens: string[]): CanonToken[] {
  const result: CanonToken[] = [];
  for (let i = 0; i < allTokens.length; i++) {
    const raw = allTokens[i];
    if (STOPWORDS.has(raw) && !RELATION_WORDS.has(raw) && !PHRASE_BREAKERS.has(raw)) continue;
    if (RELATION_WORDS.has(raw) || PHRASE_BREAKERS.has(raw)) {
      // Keep structural / boundary words in the stream so we can detect
      // phrase breaks and relationships, but they won't become entities.
      result.push({ raw, canonical: raw, type: "unknown", sourceIndex: i });
      continue;
    }
    const { canonical, type } = resolveToken(raw);
    result.push({ raw, canonical, type, sourceIndex: i });
  }
  return result;
}

// ── Main transform function ───────────────────────────────────────────

export function transformDreamToWorld(dream: string): WorldModel {
  const normalized = normalizeDream(dream);
  const allTokens = normalized.match(/[a-z]+/g) ?? [];
  const canonTokens = buildCanonTokens(allTokens);

  const entities: WorldEntity[] = [];
  const relationships: WorldRelation[] = [];
  const seenCanonical = new Set<string>();
  const entityByCanonical = new Map<string, WorldEntity>();

  // Debug array — populated always, logged only in dev
  const debugTokens: TokenDebug[] = [];

  // ── Phase 1: Create entities (deduplicated by canonical name) ────
  for (const ct of canonTokens) {
    if (RELATION_WORDS.has(ct.canonical) || PHRASE_BREAKERS.has(ct.canonical)) continue;
    debugTokens.push({ original: ct.raw, canonical: ct.canonical, type: ct.type });

    if (seenCanonical.has(ct.canonical)) continue;
    seenCanonical.add(ct.canonical);

    const entity: WorldEntity = {
      id: `entity_${entities.length + 1}`,
      type: ct.type,
      attributes: { name: ct.canonical }
    };
    entities.push(entity);
    entityByCanonical.set(ct.canonical, entity);
  }

  // ── Phase 2: Phrase grouping — descriptor stacks modify next noun ─
  // Walk canonical tokens; collect consecutive descriptors (and nouns
  // acting as modifiers before another noun) and bind them all to the
  // final noun in the phrase.
  const usedDescriptors = new Set<string>(); // track descriptors already bound by grouping
  {
    const pendingModifiers: string[] = [];
    for (let ci = 0; ci < canonTokens.length; ci++) {
      const ct = canonTokens[ci];
      if (RELATION_WORDS.has(ct.canonical) || PHRASE_BREAKERS.has(ct.canonical)) {
        pendingModifiers.length = 0;
        continue;
      }
      if (ct.type === "descriptor") {
        pendingModifiers.push(ct.canonical);
        continue;
      }
      if (ct.type === "place" || ct.type === "object") {
        // Peek ahead: is the next content token also a noun?
        let nextIsNoun = false;
        for (let j = ci + 1; j < canonTokens.length; j++) {
          const nxt = canonTokens[j];
          if (RELATION_WORDS.has(nxt.canonical)) break;
          if (nxt.type === "descriptor") { nextIsNoun = false; break; }
          if (nxt.type === "place" || nxt.type === "object") { nextIsNoun = true; break; }
          break; // unknown — stop
        }

        if (nextIsNoun) {
          // This noun is a pre-modifier (e.g. "stone" in "stone fragments",
          // "crystal" in "crystal skyscrapers"). Queue it.
          pendingModifiers.push(ct.canonical);
        } else {
          // This is the target noun — bind all queued modifiers to it.
          const target = entityByCanonical.get(ct.canonical);
          if (target && pendingModifiers.length > 0) {
            for (const mod of pendingModifiers) {
              const from = entityByCanonical.get(mod);
              if (from) {
                relationships.push({
                  id: `relation_${relationships.length + 1}`,
                  type: "modifies",
                  from: from.id,
                  to: target.id
                });
                usedDescriptors.add(mod);
              }
            }
          }
          pendingModifiers.length = 0;
        }
      } else {
        pendingModifiers.length = 0;
      }
    }
  }

  // ── Phase 3: Fallback descriptor binding ─────────────────────────
  // Any descriptor not yet bound via phrase grouping attaches to the
  // nearest noun to the right (original behavior).
  for (let i = 0; i < canonTokens.length; i++) {
    const ct = canonTokens[i];
    if (ct.type !== "descriptor") continue;
    if (usedDescriptors.has(ct.canonical)) continue;

    const from = entityByCanonical.get(ct.canonical);
    if (!from) continue;

    for (let j = i + 1; j < canonTokens.length; j++) {
      const cand = canonTokens[j];
      if (cand.type === "descriptor") continue;
      if (cand.type === "place" || cand.type === "object") {
        const target = entityByCanonical.get(cand.canonical);
        if (target) {
          relationships.push({
            id: `relation_${relationships.length + 1}`,
            type: "modifies",
            from: from.id,
            to: target.id
          });
        }
        break;
      }
      break; // unknown or relation word — stop looking
    }
  }

  // ── Phase 4: Structural relationships (above / under / in / at) ──
  const findNearestNoun = (start: number, direction: -1 | 1): WorldEntity | undefined => {
    for (let i = start; i >= 0 && i < canonTokens.length; i += direction) {
      const e = entityByCanonical.get(canonTokens[i].canonical);
      if (e && (e.type === "place" || e.type === "object")) return e;
    }
    return undefined;
  };

  for (let i = 0; i < canonTokens.length; i++) {
    const word = canonTokens[i].canonical;

    if (word === "above") {
      const from = findNearestNoun(i - 1, -1);
      const to = findNearestNoun(i + 1, 1);
      if (from && to) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "above",
          from: from.id,
          to: to.id
        });
      }
    }

    // "under" / "below" → same as "above" but reversed
    if (word === "under" || word === "below") {
      const from = findNearestNoun(i - 1, -1);
      const to = findNearestNoun(i + 1, 1);
      if (from && to) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "above",
          from: to.id,
          to: from.id
        });
      }
    }

    if (word === "in" || word === "at") {
      const from = findNearestNoun(i - 1, -1);
      const to = findNearestNoun(i + 1, 1);
      if (from && to) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "located_in",
          from: from.id,
          to: to.id
        });
      }
    }
  }

  // ── Fallback: ensure at least one place exists ───────────────────
  const hasPlace = entities.some((e) => e.type === "place");
  if (!hasPlace) {
    const fallbackPlace: WorldEntity = {
      id: `entity_${entities.length + 1}`,
      type: "place",
      attributes: { name: "dream zone" }
    };
    entities.unshift(fallbackPlace);
    entityByCanonical.set("dream zone", fallbackPlace);

    entities.forEach((e) => {
      if (e.type === "unknown" && e.id !== fallbackPlace.id) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "located_in",
          from: e.id,
          to: fallbackPlace.id
        });
      }
    });
  }

  // ── Debug output (dev only) ──────────────────────────────────────
  logParseDebug(debugTokens);

  const semantics = inferSemantics(entities);

  return { entities, relationships, semantics };
}

// ── Semantic tag inference ─────────────────────────────────────────
function inferSemantics(entities: WorldEntity[]): SemanticTags {
  const names = new Set(entities.map((e) => e.attributes.name));
  const all = [...names];

  // Environment
  const envRules: Array<[EnvironmentType, string[]]> = [
    ["ocean",    ["ocean", "sea", "beach", "waves", "lake", "river", "island"]],
    ["forest",   ["forest", "trees", "tree", "jungle", "garden"]],
    ["city",     ["city", "street", "village", "building", "buildings"]],
    ["sky",      ["clouds", "cloud", "sky", "floating"]],
    ["mountain", ["mountain", "cliff", "valley", "canyon"]],
    ["desert",   ["desert"]],
    ["void",     ["void", "space", "dark"]],
  ];
  let environment: EnvironmentType = "generic";
  for (const [env, keywords] of envRules) {
    if (keywords.some((k) => names.has(k))) { environment = env; break; }
  }
  // "sky" overrides if "floating" or "above clouds" is present
  if (names.has("floating") || (names.has("clouds") && names.has("city"))) {
    environment = "sky";
  }

  // Mood
  const moodRules: Array<[MoodType, string[]]> = [
    ["chaotic",   ["storm", "stormy", "thunder", "burning", "broken"]],
    ["dark",      ["dark", "night", "void", "shadowy", "spectral"]],
    ["mystical",  ["magical", "ethereal", "enchanted", "mystical", "surreal",
                   "cosmic", "luminous", "sacred", "glowing"]],
    ["dreamlike", ["dreamlike", "floating", "endless", "misty", "hidden"]],
    ["calm",      ["calm", "quiet", "garden", "lake", "gentle"]],
  ];
  let mood: MoodType = "calm";
  for (const [m, keywords] of moodRules) {
    if (keywords.some((k) => names.has(k))) { mood = m; break; }
  }

  // Time
  let time: TimeOfDay = "day";
  if (all.some((n) => ["sunset", "dusk", "golden", "dawn"].includes(n))) time = "sunset";
  if (all.some((n) => ["night", "moon", "stars", "starry", "dark"].includes(n))) time = "night";

  // Weather
  let weather: WeatherType = "clear";
  if (all.some((n) => ["storm", "stormy", "thunder"].includes(n))) weather = "storm";
  else if (all.some((n) => ["rain", "rainy"].includes(n))) weather = "rain";
  else if (all.some((n) => ["snow", "snowy", "frozen"].includes(n))) weather = "snow";
  else if (all.some((n) => ["clouds", "cloud", "cloudy", "misty"].includes(n))) weather = "cloudy";

  // Scale
  let scale: ScaleType = "normal";
  if (all.some((n) => ["giant", "massive", "huge", "colossal"].includes(n))) scale = "giant";
  else if (all.some((n) => ["tiny", "small", "miniature"].includes(n))) scale = "tiny";
  else if (all.some((n) => ["endless", "infinite", "vast"].includes(n))) scale = "endless";

  return { environment, mood, time, weather, scale };
}

// ── Dev-only debug logging ────────────────────────────────────────────
let _debugEnabled: boolean | null = null;
function isDebugEnabled(): boolean {
  if (_debugEnabled === null) {
    try {
      // Works in browsers; fails silently in Node
      _debugEnabled = typeof location !== "undefined" && /[?&]debug/.test(location.search);
    } catch {
      _debugEnabled = false;
    }
  }
  return _debugEnabled;
}

function logParseDebug(tokens: TokenDebug[]): void {
  if (!isDebugEnabled()) return;
  console.groupCollapsed("[DTWE] Parse debug");
  console.table(tokens.map((t) => ({
    original: t.original,
    canonical: t.canonical,
    type: t.type
  })));
  console.groupEnd();
}

/**
 * Programmatic access to the last parse's debug data.
 * Call transformDreamToWorld first, then call this to inspect mappings.
 */
export function debugLastParse(dream: string): TokenDebug[] {
  const normalized = normalizeDream(dream);
  const allTokens = normalized.match(/[a-z]+/g) ?? [];
  const canonTokens = buildCanonTokens(allTokens);
  const result: TokenDebug[] = [];
  for (const ct of canonTokens) {
    if (RELATION_WORDS.has(ct.canonical) || PHRASE_BREAKERS.has(ct.canonical)) continue;
    result.push({ original: ct.raw, canonical: ct.canonical, type: ct.type });
  }
  return result;
}

// ── Procedural dream generator ────────────────────────────────────────
const DREAM_PLACES = [
  "ocean", "city", "forest", "ruins", "mountains", "desert", "castle",
  "clouds", "cave", "garden", "temple", "village", "palace", "lake",
  "island", "valley", "jungle", "cliff", "void", "realm", "canyon",
  "river", "sea", "field", "sky"
];
const DREAM_DESCRIPTORS = [
  "glowing", "floating", "ancient", "giant", "broken", "golden",
  "silver", "glass", "dark", "bright", "frozen", "burning",
  "endless", "magical", "ethereal", "hidden", "massive", "sacred",
  "misty", "luminous", "neon", "surreal", "cosmic", "spectral",
  "enchanted", "shadowy", "lost", "vast", "deep", "tall"
];
const DREAM_OBJECTS = [
  "tower", "ruins", "bridge", "crystals", "statue", "gate",
  "pillars", "stones", "tree", "monument", "orb", "throne",
  "fragments", "spires", "walls", "columns", "lanterns"
];
const DREAM_MODIFIERS = [
  "above clouds", "under a purple sky", "during a golden sunset",
  "in a storm", "at night with stars", "over the ocean",
  "in the rain", "under moonlight", "at dawn",
  "with floating fragments", "beside an ancient river",
  "surrounded by mist", "during a thunderstorm",
  "beneath a frozen moon", "in eternal twilight",
  "with glowing crystals everywhere", "at the edge of the void"
];
const DREAM_CONDITIONS = [
  "where time stands still", "that stretches beyond the horizon",
  "shrouded in purple light", "half-submerged in water",
  "crumbling into the sky", "reflected in an endless mirror",
  "surrounded by floating debris", "pulsing with inner light"
];

export function generateRandomDream(): string {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const parts: string[] = [];

  // Always: descriptor + place
  parts.push(`A ${pick(DREAM_DESCRIPTORS)} ${pick(DREAM_PLACES)}`);

  // 70% chance: second descriptor + place
  if (Math.random() > 0.3) {
    parts.push(`and a ${pick(DREAM_DESCRIPTORS)} ${pick(DREAM_PLACES)}`);
  }

  // 60% chance: object with descriptor
  if (Math.random() > 0.4) {
    parts.push(`with ${pick(DREAM_DESCRIPTORS)} ${pick(DREAM_OBJECTS)}`);
  }

  // Always: modifier (setting / atmosphere)
  parts.push(pick(DREAM_MODIFIERS));

  // 40% chance: condition
  if (Math.random() > 0.6) {
    parts.push(pick(DREAM_CONDITIONS));
  }

  return parts.join(" ");
}
