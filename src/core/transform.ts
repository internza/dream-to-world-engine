import { canonicalizeToken } from "./knowledge.js";
import type { GeneratorFamily } from "./knowledge.js";

export type EntityType = "place" | "object" | "descriptor" | "unknown";
export type RelationType = "modifies" | "located_in" | "above" | "beside" | "across" | "inside";
export type LandmarkRole = "primary_landmark" | "secondary_landmark" | "background" | "none";

export interface WorldEntity {
  id: string;
  type: EntityType;
  attributes: { name: string };
  landmarkRole: LandmarkRole;
}

// ── Environment archetypes (Iter 14B) ────────────────────────────────
export type EnvironmentArchetype =
  | "floating_city"
  | "ocean_realm"
  | "forest_ruins"
  | "storm_void"
  | "surreal_desert"
  | "castle_sky"
  | "dream_zone";

export interface WorldModel {
  entities: WorldEntity[];
  relationships: WorldRelation[];
  semantics: SemanticTags;
  archetype: EnvironmentArchetype;
  primaryLandmarkId: string | null;
  dreamProfile: DreamProfile;
}

// ── 15C: Dream intelligence layer ────────────────────────────────────
export type ColorPalette = "warm" | "cool" | "neutral" | "dark" | "vibrant" | "muted";
export type SpatialLayout = "centered" | "layered" | "scattered" | "enclosed" | "open";
export type EmotionalTone = "wonder" | "dread" | "serenity" | "tension" | "nostalgia" | "awe";

export interface DreamProfile {
  /** Dominant color palette for the scene */
  palette: ColorPalette;
  /** How entities are spatially arranged */
  layout: SpatialLayout;
  /** Emotional undercurrent of the dream */
  tone: EmotionalTone;
  /** 0-1 measure of how many surreal/impossible elements appear */
  coherence: number;
  /** Descriptive complexity: how many unique descriptors relative to entities */
  richness: number;
  /** Keywords driving the scene (top 5 entity names) */
  keywords: string[];
}

// ── Environment / mood / tag types (expanded Iter 16) ────────────────
export type EnvironmentType =
  | "ocean" | "forest" | "city" | "sky" | "void" | "mountain"
  | "desert" | "generic" | "coastal" | "cave" | "frozen"
  | "storm" | "celestial" | "ruins" | "surreal";

export type MoodType = "calm" | "dark" | "dreamlike" | "chaotic" | "mystical";
export type TimeOfDay = "day" | "sunset" | "night";
export type WeatherType = "clear" | "cloudy" | "rain" | "storm" | "snow" | "fog" | "wind" | "aurora";
export type ScaleType = "normal" | "giant" | "tiny" | "endless";
export type DensityPreset = "sparse" | "balanced" | "dense" | "endless";
export type SurrealityLevel = "normal" | "heightened" | "extreme";
export type DangerLevel = "calm" | "neutral" | "tense" | "dangerous";
export type MaterialEmphasis = "none" | "crystal" | "metal" | "stone" | "organic" | "glass" | "emissive";
export type VerticalityLevel = "low" | "medium" | "high";

export interface SemanticTags {
  environment: EnvironmentType;
  mood: MoodType;
  time: TimeOfDay;
  weather: WeatherType;
  scale: ScaleType;
  density: DensityPreset;
  surreality: SurrealityLevel;
  danger: DangerLevel;
  materialEmphasis: MaterialEmphasis;
  verticality: VerticalityLevel;
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

export interface ParseDebugInfo {
  tokens: TokenDebug[];
  semantics: SemanticTags;
  generatorFamilies: Array<{ name: string; family: string }>;
}

const STOPWORDS = new Set([
  "i", "am", "is", "are", "was", "were", "a", "an", "the",
  "and", "or", "but", "at", "in", "on", "of", "to", "with",
  "above", "below", "under", "beside", "near", "into", "through",
  "across", "between", "over", "around", "from", "that", "there",
  "here", "some", "my", "their", "its", "very", "been", "like",
  "than", "then", "not", "so", "just", "all", "it", "up", "down",
  "out", "had", "has", "have", "would", "could", "should",
  "inside", "beyond", "surrounded"
]);

// Structural words used for relationship inference
const RELATION_WORDS = new Set([
  "above", "below", "under", "in", "at",
  "beside", "near", "across", "inside", "beyond", "surrounded"
]);

// Conjunctions / prepositions that break noun phrases but don't become entities
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
    "sky", "void", "realm", "cliff", "canyon", "harbor",
    "plaza", "bazaar", "marsh", "glacier", "tundra", "oasis",
    "arena", "library", "crypt", "dungeon", "dreamscape",
    "volcano", "plateau", "reef", "rooftop"
  ];
  const objects = [
    "tower", "towers", "ship", "car", "door", "tree", "trees",
    "building", "buildings", "stone", "stones", "fragment", "fragments",
    "crystal", "crystals", "ruins", "ruin", "rock", "rocks",
    "bridge", "bridges", "wall", "walls", "gate", "gates",
    "statue", "statues", "pillar", "pillars", "column", "columns",
    "orb", "throne", "altar", "sword", "monument", "lantern",
    "lamp", "spire", "spires", "mirror", "stairs", "platform",
    "fountain", "cage", "chain", "skull", "bone", "bell",
    "lighthouse", "windmill", "pyramid", "dome", "arch",
    "vine", "root", "mushroom", "flower", "flag", "crown",
    "book", "mask", "ring", "anchor", "campfire", "steeple",
    "window", "clock", "key"
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
    "sunset", "dusk", "dawn", "surreal", "mystical", "dreamlike", "cosmic",
    "tiny", "crimson", "emerald", "azure", "ivory", "copper",
    "shimmering", "twisted", "shattered", "hollow", "submerged",
    "overgrown", "petrified", "dusty", "rusty", "cursed", "forgotten",
    "haunted", "whispering", "pulsing", "inverted", "mirrored",
    "kaleidoscopic", "melting", "wooden", "marble", "organic",
    "mechanical", "ornate", "wind", "fog", "aurora", "eclipse",
    "comet"
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
  const legacy = classifyWord(raw);
  if (legacy !== "unknown") {
    return { canonical: raw, type: legacy };
  }
  const legacyCanonical = classifyWord(kb.canonical);
  return { canonical: kb.canonical, type: legacyCanonical };
}

// ── Phrase grouping helpers ───────────────────────────────────────────

interface CanonToken {
  raw: string;
  canonical: string;
  type: EntityType;
  sourceIndex: number;
}

function buildCanonTokens(allTokens: string[]): CanonToken[] {
  const result: CanonToken[] = [];
  for (let i = 0; i < allTokens.length; i++) {
    const raw = allTokens[i];
    if (STOPWORDS.has(raw) && !RELATION_WORDS.has(raw) && !PHRASE_BREAKERS.has(raw)) continue;
    if (RELATION_WORDS.has(raw) || PHRASE_BREAKERS.has(raw)) {
      result.push({ raw, canonical: raw, type: "unknown", sourceIndex: i });
      continue;
    }
    const { canonical, type } = resolveToken(raw);
    result.push({ raw, canonical, type, sourceIndex: i });
  }
  return result;
}

// ── Last parse debug info (stored for programmatic access) ───────────
let _lastParseDebug: ParseDebugInfo | null = null;
export function getLastParseDebug(): ParseDebugInfo | null { return _lastParseDebug; }

// ── Main transform function ───────────────────────────────────────────

export function transformDreamToWorld(dream: string): WorldModel {
  const normalized = normalizeDream(dream);
  const allTokens = normalized.match(/[a-z]+/g) ?? [];
  const canonTokens = buildCanonTokens(allTokens);

  const entities: WorldEntity[] = [];
  const relationships: WorldRelation[] = [];
  const seenCanonical = new Set<string>();
  const entityByCanonical = new Map<string, WorldEntity>();

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
      attributes: { name: ct.canonical },
      landmarkRole: "none"
    };
    entities.push(entity);
    entityByCanonical.set(ct.canonical, entity);
  }

  // ── Phase 2: Phrase grouping — descriptor stacks modify next noun ─
  const usedDescriptors = new Set<string>();
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
        let nextIsNoun = false;
        for (let j = ci + 1; j < canonTokens.length; j++) {
          const nxt = canonTokens[j];
          if (RELATION_WORDS.has(nxt.canonical)) break;
          if (nxt.type === "descriptor") { nextIsNoun = false; break; }
          if (nxt.type === "place" || nxt.type === "object") { nextIsNoun = true; break; }
          break;
        }

        if (nextIsNoun) {
          pendingModifiers.push(ct.canonical);
        } else {
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
      break;
    }
  }

  // ── Phase 4: Structural relationships ────────────────────────────
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

    if (word === "in" || word === "at" || word === "inside") {
      const from = findNearestNoun(i - 1, -1);
      const to = findNearestNoun(i + 1, 1);
      if (from && to) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "inside",
          from: from.id,
          to: to.id
        });
      }
    }

    if (word === "beside" || word === "near") {
      const from = findNearestNoun(i - 1, -1);
      const to = findNearestNoun(i + 1, 1);
      if (from && to) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "beside",
          from: from.id,
          to: to.id
        });
      }
    }

    if (word === "across" || word === "beyond") {
      const from = findNearestNoun(i - 1, -1);
      const to = findNearestNoun(i + 1, 1);
      if (from && to) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "across",
          from: from.id,
          to: to.id
        });
      }
    }

    // "surrounded by X" → X located_in around from
    if (word === "surrounded") {
      const from = findNearestNoun(i - 1, -1);
      const to = findNearestNoun(i + 1, 1);
      if (from && to) {
        relationships.push({
          id: `relation_${relationships.length + 1}`,
          type: "located_in",
          from: to.id,
          to: from.id
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
      attributes: { name: "dream zone" },
      landmarkRole: "none"
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

  const semantics = inferSemantics(entities);
  const archetype = resolveEnvironmentArchetype(entities, relationships, semantics);

  // ── 14C: Assign landmark roles ────────────────────────────────────
  const primaryLandmarkId = assignLandmarkRoles(entities, relationships, semantics);

  // ── Build and store debug info ────────────────────────────────────
  const familyInfo: Array<{ name: string; family: string }> = [];
  for (const e of entities) {
    const kb = canonicalizeToken(e.attributes.name);
    if (kb.generatorHint) {
      familyInfo.push({ name: e.attributes.name, family: kb.generatorHint });
    }
  }
  _lastParseDebug = { tokens: debugTokens, semantics, generatorFamilies: familyInfo };

  logParseDebug(debugTokens, semantics);

  // ── 15C: Build dream intelligence profile ─────────────────────────
  const dreamProfile = buildDreamProfile(entities, relationships, semantics);

  return { entities, relationships, semantics, archetype, primaryLandmarkId, dreamProfile };
}

// ── Environment archetype resolution (Iter 14B) ──────────────────────
function resolveEnvironmentArchetype(
  entities: WorldEntity[],
  relationships: WorldRelation[],
  semantics: SemanticTags
): EnvironmentArchetype {
  const names = new Set(entities.map((e) => e.attributes.name));
  const descriptors = new Set(
    entities.filter((e) => e.type === "descriptor").map((e) => e.attributes.name)
  );

  const hasAboveRelation = (from: string, to: string): boolean =>
    relationships.some((r) => {
      if (r.type !== "above") return false;
      const fromName = entities.find((e) => e.id === r.from)?.attributes.name;
      const toName = entities.find((e) => e.id === r.to)?.attributes.name;
      return fromName === from && toName === to;
    });

  const hasName = (...ns: string[]) => ns.some((n) => names.has(n));
  const hasDesc = (...ds: string[]) => ds.some((d) => descriptors.has(d));

  // floating_city: city + clouds/sky + floating
  if (hasName("city") && (hasDesc("floating") || hasName("clouds", "sky"))) return "floating_city";
  if (hasName("city") && hasAboveRelation("city", "clouds")) return "floating_city";

  // castle_sky: castle + sky/clouds/above
  if (hasName("castle") && (hasName("sky", "clouds") || hasDesc("floating"))) return "castle_sky";
  if (hasName("castle") && hasName("ocean") && hasAboveRelation("castle", "ocean")) return "castle_sky";

  // ocean_realm: ocean/sea + structures/islands
  if (hasName("ocean", "sea", "lake") && (hasName("castle", "island", "ruins", "tower", "temple"))) return "ocean_realm";
  if (hasName("ocean", "sea") && semantics.environment === "ocean") return "ocean_realm";

  // forest_ruins: forest + ruins/ancient/temple
  if (hasName("forest", "jungle", "garden") && (hasName("ruins", "temple") || hasDesc("ancient", "ruined"))) return "forest_ruins";

  // storm_void: storm/thunder + void/dark/broken
  if ((hasDesc("storm", "thunder") || semantics.weather === "storm") && (hasName("void") || hasDesc("dark", "broken", "shattered"))) return "storm_void";
  if (semantics.environment === "storm") return "storm_void";

  // surreal_desert: desert + surreal/dreamlike modifiers
  if (hasName("desert") && (hasDesc("surreal", "endless", "mirrored", "inverted"))) return "surreal_desert";
  if (hasName("desert") && semantics.surreality !== "normal") return "surreal_desert";

  // Broader fallback matches based on primary environment
  if (hasName("city") || semantics.environment === "city") {
    if (hasDesc("floating") || semantics.verticality === "high") return "floating_city";
  }
  if (semantics.environment === "ocean" || semantics.environment === "coastal") return "ocean_realm";
  if (semantics.environment === "forest") {
    if (hasName("ruins") || hasDesc("ancient", "ruined")) return "forest_ruins";
  }
  if (semantics.environment === "desert") return "surreal_desert";
  if (semantics.environment === "sky") return "floating_city";
  if (hasName("castle") || (semantics.environment === "mountain" && hasName("castle"))) return "castle_sky";

  return "dream_zone";
}

// ── 14C: Landmark role assignment (dream interpretation) ─────────────

// Nouns ranked by "landmark-ness": structures > architecture > objects > places
const PRIMARY_LANDMARK_NOUNS = new Set([
  "temple", "castle", "arena", "palace", "tower", "pyramid", "lighthouse",
  "cathedral", "colosseum", "fortress", "citadel", "monument", "cave",
  "volcano", "library", "crypt"
]);
// Architecturally strong primary nouns get a bonus – they are built structures
const STRONG_PRIMARY_NOUNS = new Set([
  "temple", "castle", "arena", "palace", "pyramid", "cathedral",
  "colosseum", "fortress", "citadel", "monument"
]);
const SECONDARY_LANDMARK_NOUNS = new Set([
  "ruins", "statue", "pillar", "gate", "bridge", "fountain", "altar",
  "throne", "spire", "dome", "arch", "bell", "orb", "mirror",
  "crystal", "steeple", "windmill", "campfire", "cage", "obelisk"
]);
const BACKGROUND_NOUNS = new Set([
  "ocean", "sea", "forest", "clouds", "sky", "desert", "beach",
  "field", "mountain", "river", "lake", "glacier", "tundra", "marsh",
  "jungle", "valley", "reef", "void"
]);

// Adjectives that boost a noun to primary
const EMPHASIS_DESCRIPTORS = new Set([
  "giant", "massive", "colossal", "towering", "immense",
  "sacred", "enchanted", "magical", "pulsing", "ornate"
]);

function assignLandmarkRoles(
  entities: WorldEntity[],
  relationships: WorldRelation[],
  _semantics: SemanticTags
): string | null {
  // Score each non-descriptor entity for landmark priority
  const scores = new Map<string, number>();

  for (const e of entities) {
    if (e.type === "descriptor") continue;
    const name = e.attributes.name;
    let score = 0;

    // Base score from noun category
    if (PRIMARY_LANDMARK_NOUNS.has(name)) score += 10;
    else if (SECONDARY_LANDMARK_NOUNS.has(name)) score += 5;
    else if (BACKGROUND_NOUNS.has(name)) score += 0;
    else if (e.type === "object") score += 3; // unknown objects default to secondary
    else if (e.type === "place") score += 1;

    // Architecturally strong structures get an extra bump
    if (STRONG_PRIMARY_NOUNS.has(name)) score += 5;

    // Boost from emphasis descriptors modifying this entity
    for (const rel of relationships) {
      if (rel.type !== "modifies" || rel.to !== e.id) continue;
      const modEntity = entities.find((m) => m.id === rel.from);
      if (modEntity && EMPHASIS_DESCRIPTORS.has(modEntity.attributes.name)) {
        score += 4;
      }
    }

    // "above" subject gets a boost (it's structurally dominant)
    for (const rel of relationships) {
      if (rel.type === "above" && rel.from === e.id) score += 3;
    }

    // First-mentioned noun gets a small priority boost
    const idx = entities.indexOf(e);
    if (idx <= 1) score += 1; // first or second entity

    scores.set(e.id, score);
  }

  // Sort entities by score descending
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);

  let primaryId: string | null = null;
  let secondaryCount = 0;
  const MAX_SECONDARY = 4;

  for (const [id, score] of ranked) {
    const e = entities.find((ent) => ent.id === id);
    if (!e) continue;

    if (!primaryId && score >= 3) {
      e.landmarkRole = "primary_landmark";
      primaryId = id;
    } else if (secondaryCount < MAX_SECONDARY && score >= 2) {
      e.landmarkRole = "secondary_landmark";
      secondaryCount++;
    } else if (BACKGROUND_NOUNS.has(e.attributes.name)) {
      e.landmarkRole = "background";
    }
    // else stays "none"
  }

  // If no primary was found, promote the highest-scoring non-descriptor
  if (!primaryId && ranked.length > 0) {
    const [topId] = ranked[0];
    const topEntity = entities.find((e) => e.id === topId);
    if (topEntity) {
      topEntity.landmarkRole = "primary_landmark";
      primaryId = topId;
    }
  }

  return primaryId;
}

// ── Semantic tag inference (expanded Iter 16) ─────────────────────────
function inferSemantics(entities: WorldEntity[]): SemanticTags {
  const names = new Set(entities.map((e) => e.attributes.name));
  const all = [...names];

  // ── Environment ────────────────────────────────────────────────────
  const envRules: Array<[EnvironmentType, string[]]> = [
    ["ocean",     ["ocean", "sea"]],
    ["coastal",   ["beach", "harbor", "reef", "island", "shore", "coast", "lighthouse"]],
    ["forest",    ["forest", "trees", "tree", "jungle", "garden", "marsh"]],
    ["city",      ["city", "street", "village", "building", "buildings", "plaza", "bazaar", "rooftop"]],
    ["sky",       ["clouds", "cloud", "sky", "floating"]],
    ["mountain",  ["mountain", "cliff", "valley", "canyon", "volcano", "plateau"]],
    ["desert",    ["desert", "oasis"]],
    ["cave",      ["cave", "crypt", "dungeon"]],
    ["frozen",    ["glacier", "tundra"]],
    ["celestial", ["space", "cosmos", "nebula", "galaxy"]],
    ["ruins",     ["ruins", "ruin", "temple", "crypt"]],
    ["surreal",   ["dreamscape", "realm", "mirror", "kaleidoscopic"]],
    ["void",      ["void", "dark"]],
  ];
  let environment: EnvironmentType = "generic";
  for (const [env, keywords] of envRules) {
    if (keywords.some((k) => names.has(k))) { environment = env; break; }
  }
  if (names.has("floating") || (names.has("clouds") && names.has("city"))) {
    environment = "sky";
  }
  // Frozen descriptor overrides to frozen env
  if (names.has("frozen") && environment === "generic") environment = "frozen";
  // Storm descriptor can override
  if ((names.has("storm") || names.has("thunder")) && environment === "generic") environment = "storm";

  // ── Mood ───────────────────────────────────────────────────────────
  const moodRules: Array<[MoodType, string[]]> = [
    ["chaotic",   ["storm", "stormy", "thunder", "burning", "broken", "shattered", "cursed", "haunted"]],
    ["dark",      ["dark", "night", "void", "shadowy", "spectral", "forgotten", "dungeon", "crypt"]],
    ["mystical",  ["magical", "ethereal", "enchanted", "mystical", "surreal",
                   "cosmic", "luminous", "sacred", "bright", "aurora", "pulsing", "whispering"]],
    ["dreamlike", ["dreamlike", "floating", "endless", "misty", "hidden", "melting",
                   "inverted", "mirrored", "kaleidoscopic", "dreamscape"]],
    ["calm",      ["quiet", "garden", "lake", "gentle", "field"]],
  ];
  let mood: MoodType = "calm";
  for (const [m, keywords] of moodRules) {
    if (keywords.some((k) => names.has(k))) { mood = m; break; }
  }

  // ── Time ───────────────────────────────────────────────────────────
  let time: TimeOfDay = "day";
  if (all.some((n) => ["sunset", "dusk", "golden", "dawn"].includes(n))) time = "sunset";
  if (all.some((n) => ["night", "moon", "stars", "starry", "dark", "eclipse"].includes(n))) time = "night";

  // ── Weather ────────────────────────────────────────────────────────
  let weather: WeatherType = "clear";
  if (all.some((n) => ["storm", "stormy", "thunder"].includes(n))) weather = "storm";
  else if (all.some((n) => ["rain", "rainy"].includes(n))) weather = "rain";
  else if (all.some((n) => ["snow", "snowy", "frozen", "glacier", "tundra"].includes(n))) weather = "snow";
  else if (all.some((n) => ["fog", "misty"].includes(n))) weather = "fog";
  else if (all.some((n) => ["wind", "windy"].includes(n))) weather = "wind";
  else if (all.some((n) => ["aurora"].includes(n))) weather = "aurora";
  else if (all.some((n) => ["clouds", "cloud", "cloudy"].includes(n))) weather = "cloudy";

  // ── Scale ──────────────────────────────────────────────────────────
  let scale: ScaleType = "normal";
  if (all.some((n) => ["giant", "massive", "huge", "colossal"].includes(n))) scale = "giant";
  else if (all.some((n) => ["tiny", "small", "miniature"].includes(n))) scale = "tiny";
  else if (all.some((n) => ["endless", "infinite", "vast"].includes(n))) scale = "endless";

  // ── Density (new Iter 16) ──────────────────────────────────────────
  let density: DensityPreset = "balanced";
  if (all.some((n) => ["endless", "infinite", "vast", "dense"].includes(n))) density = "dense";
  else if (all.some((n) => ["tiny", "small", "quiet"].includes(n))) density = "sparse";
  else if (scale === "endless") density = "endless";
  else if (scale === "giant") density = "dense";

  // ── Surreality (new Iter 16) ───────────────────────────────────────
  let surreality: SurrealityLevel = "normal";
  const surrealWords = ["surreal", "dreamlike", "inverted", "mirrored", "kaleidoscopic",
    "melting", "floating", "ethereal", "cosmic", "psychedelic", "dreamscape", "realm"];
  const surrealCount = all.filter((n) => surrealWords.includes(n)).length;
  if (surrealCount >= 3) surreality = "extreme";
  else if (surrealCount >= 1) surreality = "heightened";

  // ── Danger (new Iter 16) ───────────────────────────────────────────
  let danger: DangerLevel = "neutral";
  if (all.some((n) => ["storm", "thunder", "burning", "cursed", "haunted", "dungeon", "shattered"].includes(n))) danger = "dangerous";
  else if (all.some((n) => ["dark", "void", "crypt", "frozen"].includes(n))) danger = "tense";
  else if (all.some((n) => ["quiet", "garden", "lake", "field"].includes(n))) danger = "calm";

  // ── Material emphasis (new Iter 16) ────────────────────────────────
  let materialEmphasis: MaterialEmphasis = "none";
  if (all.some((n) => ["crystal", "crystals", "glass", "prismatic", "shimmering"].includes(n))) materialEmphasis = "crystal";
  else if (all.some((n) => ["silver", "copper", "mechanical", "rusty", "iron"].includes(n))) materialEmphasis = "metal";
  else if (all.some((n) => ["stone", "marble", "petrified", "granite"].includes(n))) materialEmphasis = "stone";
  else if (all.some((n) => ["organic", "overgrown", "vine", "root", "mushroom", "flower"].includes(n))) materialEmphasis = "organic";
  else if (all.some((n) => ["bright", "neon", "pulsing", "aurora"].includes(n))) materialEmphasis = "emissive";

  // ── Verticality (new Iter 16) ──────────────────────────────────────
  let verticality: VerticalityLevel = "medium";
  if (all.some((n) => ["floating", "sky", "clouds", "above", "tower", "steeple", "spire"].includes(n))) verticality = "high";
  else if (all.some((n) => ["cave", "crypt", "dungeon", "submerged", "underground"].includes(n))) verticality = "low";

  return { environment, mood, time, weather, scale, density, surreality, danger, materialEmphasis, verticality };
}

// ── Dev-only debug logging ────────────────────────────────────────────
let _debugEnabled: boolean | null = null;
function isDebugEnabled(): boolean {
  if (_debugEnabled === null) {
    try {
      _debugEnabled = typeof location !== "undefined" && /[?&]debug/.test(location.search);
    } catch {
      _debugEnabled = false;
    }
  }
  return _debugEnabled;
}

function logParseDebug(tokens: TokenDebug[], semantics: SemanticTags): void {
  if (!isDebugEnabled()) return;
  console.groupCollapsed("[DTWE] Parse debug");
  console.table(tokens.map((t) => ({
    original: t.original,
    canonical: t.canonical,
    type: t.type
  })));
  console.log("[DTWE] Semantics:", semantics);
  console.groupEnd();
}

/**
 * Programmatic access to a parse's debug data.
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

// ── 15C: Dream intelligence — build rich DreamProfile ────────────────

const WARM_WORDS = new Set(["golden", "burning", "lava", "crimson", "copper", "fire", "sun", "sunset", "dawn", "ember", "volcano"]);
const COOL_WORDS = new Set(["frozen", "ice", "glacier", "tundra", "silver", "crystal", "azure", "moonlight", "snow", "frost"]);
const DARK_WORDS = new Set(["dark", "shadow", "void", "crypt", "obsidian", "night", "midnight", "cursed", "haunted", "abyss"]);
const VIBRANT_WORDS = new Set(["neon", "glowing", "luminous", "pulsing", "shimmering", "aurora", "kaleidoscopic", "emerald", "rainbow"]);
const DREAD_WORDS = new Set(["haunted", "cursed", "dark", "broken", "shattered", "skull", "crypt", "ominous", "forbidden", "dangerous"]);
const WONDER_WORDS = new Set(["magical", "enchanted", "ethereal", "dreamlike", "mystical", "sacred", "cosmic", "celestial"]);
const SERENITY_WORDS = new Set(["calm", "serene", "tranquil", "gentle", "quiet", "peaceful", "still", "garden", "lake"]);
const NOSTALGIA_WORDS = new Set(["ancient", "forgotten", "lost", "old", "ruined", "abandoned", "faded", "memory"]);

function buildDreamProfile(
  entities: WorldEntity[],
  relationships: WorldRelation[],
  semantics: SemanticTags
): DreamProfile {
  const names = entities.map((e) => e.attributes.name);
  const nameSet = new Set(names);
  const descriptors = entities.filter((e) => e.type === "descriptor").map((e) => e.attributes.name);
  const descSet = new Set(descriptors);

  // ── Palette ──
  const warmCount = names.filter((n) => WARM_WORDS.has(n)).length + descriptors.filter((d) => WARM_WORDS.has(d)).length;
  const coolCount = names.filter((n) => COOL_WORDS.has(n)).length + descriptors.filter((d) => COOL_WORDS.has(d)).length;
  const darkCount = names.filter((n) => DARK_WORDS.has(n)).length + descriptors.filter((d) => DARK_WORDS.has(d)).length;
  const vibrantCount = names.filter((n) => VIBRANT_WORDS.has(n)).length + descriptors.filter((d) => VIBRANT_WORDS.has(d)).length;
  const paletteCounts: [ColorPalette, number][] = [
    ["warm", warmCount], ["cool", coolCount], ["dark", darkCount], ["vibrant", vibrantCount]
  ];
  paletteCounts.sort((a, b) => b[1] - a[1]);
  const palette: ColorPalette = paletteCounts[0][1] > 0 ? paletteCounts[0][0] : (semantics.mood === "dark" ? "muted" : "neutral");

  // ── Layout ──
  const hasAbove = relationships.some((r) => r.type === "above");
  const hasInside = relationships.some((r) => r.type === "inside");
  const hasBeside = relationships.some((r) => r.type === "beside" || r.type === "across");
  let layout: SpatialLayout = "scattered";
  if (hasInside || nameSet.has("cave") || nameSet.has("crypt") || nameSet.has("dungeon")) layout = "enclosed";
  else if (hasAbove && entities.length > 3) layout = "layered";
  else if (entities.length <= 3) layout = "centered";
  else if (hasBeside || nameSet.has("field") || nameSet.has("desert") || nameSet.has("ocean")) layout = "open";

  // ── Tone ──
  const dreadScore = names.filter((n) => DREAD_WORDS.has(n)).length + descriptors.filter((d) => DREAD_WORDS.has(d)).length;
  const wonderScore = names.filter((n) => WONDER_WORDS.has(n)).length + descriptors.filter((d) => WONDER_WORDS.has(d)).length;
  const serenityScore = names.filter((n) => SERENITY_WORDS.has(n)).length + descriptors.filter((d) => SERENITY_WORDS.has(d)).length;
  const nostalgiaScore = names.filter((n) => NOSTALGIA_WORDS.has(n)).length + descriptors.filter((d) => NOSTALGIA_WORDS.has(d)).length;
  const toneScores: [EmotionalTone, number][] = [
    ["dread", dreadScore], ["wonder", wonderScore], ["serenity", serenityScore],
    ["nostalgia", nostalgiaScore], ["awe", semantics.scale === "giant" || semantics.scale === "endless" ? 2 : 0],
    ["tension", semantics.danger === "dangerous" || semantics.danger === "tense" ? 2 : 0]
  ];
  toneScores.sort((a, b) => b[1] - a[1]);
  const tone: EmotionalTone = toneScores[0][1] > 0 ? toneScores[0][0] : "wonder";

  // ── Coherence (inverse of surreality) ──
  const surrealLevel = semantics.surreality === "extreme" ? 0.2 : semantics.surreality === "heightened" ? 0.5 : 0.85;
  const coherence = Math.max(0, Math.min(1, surrealLevel));

  // ── Richness ──
  const totalEntities = entities.length || 1;
  const richness = Math.min(1, descriptors.length / totalEntities);

  // ── Keywords ──
  const keywords = entities
    .filter((e) => e.type === "place" || e.type === "object")
    .map((e) => e.attributes.name)
    .slice(0, 5);

  return { palette, layout, tone, coherence, richness, keywords };
}

// ── 15E: Enhanced structured grammar-based random dream generator ────

const G_PLACES = [
  "ocean", "city", "forest", "ruins", "mountains", "desert", "castle",
  "clouds", "cave", "garden", "temple", "village", "palace", "lake",
  "island", "valley", "jungle", "cliff", "void", "realm", "canyon",
  "river", "sea", "field", "sky", "glacier", "tundra", "volcano",
  "marsh", "dungeon", "crypt", "arena", "library", "harbor", "plaza",
  "reef", "oasis", "dreamscape", "beach", "labyrinth", "abyss",
  "cathedral", "colosseum", "fortress", "grotto", "mesa", "savanna"
];
const G_DESCRIPTORS = [
  "glowing", "floating", "ancient", "giant", "broken", "golden",
  "silver", "glass", "dark", "bright", "frozen", "burning",
  "endless", "magical", "ethereal", "hidden", "massive", "sacred",
  "misty", "luminous", "neon", "surreal", "cosmic", "spectral",
  "enchanted", "shadowy", "lost", "vast", "deep", "tall",
  "tiny", "crimson", "emerald", "azure", "ivory", "copper",
  "twisted", "shattered", "hollow", "submerged", "overgrown",
  "petrified", "forgotten", "haunted", "whispering", "pulsing",
  "inverted", "mirrored", "ornate", "cursed", "kaleidoscopic",
  "melting", "shimmering", "dusty", "mechanical", "marble",
  "crystalline", "volcanic", "mossy", "gilded", "skeletal",
  "radiant", "translucent", "weathered", "rusted", "prismatic"
];
const G_OBJECTS = [
  "tower", "ruins", "bridge", "crystals", "statue", "gate",
  "pillars", "stones", "tree", "monument", "orb", "throne",
  "fragments", "spires", "walls", "columns", "lanterns",
  "mirror", "stairs", "fountain", "lighthouse", "pyramid",
  "dome", "arch", "skull", "bell", "cage", "campfire",
  "windmill", "vine", "mushroom", "steeple", "obelisk",
  "altar", "well", "beacon", "clock", "anvil", "harp"
];
const G_OBJECTS_PLURAL = [
  "towers", "bridges", "pillars", "fragments", "statues", "monuments",
  "gates", "columns", "lanterns", "crystals", "stones", "spires",
  "arches", "walls", "domes", "pyramids", "bells", "cages",
  "obelisks", "altars", "wells", "beacons", "mirrors", "thrones"
];
const G_SCALES = [
  "giant", "massive", "tiny", "endless", "colossal", "towering",
  "miniature", "vast", "sprawling", "immense", "hidden"
];
const G_MOODS = [
  "serene", "ominous", "mystical", "haunting", "tranquil",
  "eerie", "sacred", "solemn", "dreamlike", "forbidden",
  "forgotten", "cursed", "ancient", "ethereal", "melancholic"
];
const G_ENV_FEATURES = [
  "floating islands", "crystal formations", "ancient roots",
  "glowing fungi", "frozen waterfalls", "lava streams",
  "vine bridges", "cloud platforms", "coral growths",
  "stone arches", "mirror pools", "shadow corridors",
  "sand dunes", "ice pillars", "mushroom groves",
  "rusted machinery", "glass spires", "bone altars"
];
const G_WEATHER = [
  "rain", "storm", "snow", "fog", "wind", "aurora"
];
const G_TIMES = [
  "at night", "at dawn", "at dusk", "at sunset", "at midnight",
  "under moonlight", "under starlight", "during twilight"
];
const G_MATERIALS = [
  "crystal", "golden", "silver", "marble", "obsidian",
  "glass", "copper", "ivory", "wooden", "iron", "jade"
];
const G_SURREAL = [
  "where gravity is reversed", "that shifts when you look away",
  "reflected in an endless mirror", "growing from nothing",
  "pulsing with inner light", "dissolving into mist",
  "stretching beyond the horizon", "half-submerged in water",
  "crumbling into the sky", "surrounded by floating debris",
  "whispering forgotten names", "where time moves differently",
  "shrouded in purple light", "bleeding color into the void",
  "folding in on itself", "that exists between dreams",
  "drifting between worlds", "suspended in amber light"
];
const G_SURREAL_MODIFIERS = [
  "inverted", "drifting", "suspended", "whispering", "mirrored",
  "melting", "kaleidoscopic", "pulsing", "shimmering", "twisted",
  "folding", "unraveling", "spiraling", "echoing", "fracturing"
];
const G_ATMOSPHERE = [
  "storm", "rain", "sunset", "twilight", "moonlight", "fog",
  "aurora", "thunder", "snow", "wind", "starfall", "eclipse"
];

// ── 15E: New grammar slots for richer dreams ─────────────────────────
const G_INHABITANTS = [
  "ghosts", "spirits", "shadows", "echoes", "memories",
  "wanderers", "guardians", "sentinels", "wraiths", "pilgrims"
];
const G_ACTIONS = [
  "singing forgotten songs", "drifting between worlds",
  "dissolving into light", "rebuilding endlessly", "sleeping eternally",
  "guarding a secret", "waiting for dawn", "searching for something lost",
  "whispering to the wind", "fading in and out of existence"
];
const G_SPATIAL_RELATIONS = [
  "above", "beside", "beneath", "surrounding", "inside",
  "beyond", "across from", "at the edge of"
];

// ── 15E: Template patterns (5-7 semantic slots per dream) ─────────────
interface DreamTemplate {
  weight: number;
  build: (pick: <T>(arr: T[]) => T, maybe: (p: number) => boolean) => string;
}

const DREAM_TEMPLATES: DreamTemplate[] = [
  // Pattern 1: [scale] [descriptor] [place] [relation] [place] + [atmosphere] + [objects] + [features]
  { weight: 3, build: (pick, maybe) => {
    let s = `A ${pick(G_SCALES)} ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` ${pick(G_SPATIAL_RELATIONS)} a ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` during a ${pick(G_ATMOSPHERE)}`;
    if (maybe(0.7)) s += ` with ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS_PLURAL)}`;
    if (maybe(0.5)) s += ` and ${pick(G_ENV_FEATURES)}`;
    if (maybe(0.3)) s += ` where ${pick(G_INHABITANTS)} are ${pick(G_ACTIONS).split(" ").slice(0, 2).join(" ")}`;
    return s;
  }},
  // Pattern 2: [descriptor] [place] above [descriptor] [place] + [objects] + [time]
  { weight: 3, build: (pick, maybe) => {
    let s = `A ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)} above a ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` with ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS_PLURAL)}`;
    if (maybe(0.6)) s += ` and ${pick(G_SURREAL_MODIFIERS)} ${pick(G_OBJECTS)}`;
    s += ` ${pick(G_TIMES)}`;
    if (maybe(0.4)) s += ` ${pick(G_SURREAL)}`;
    return s;
  }},
  // Pattern 3: [mood] [environment] + [material landmark] + [objects] + [weather] + [surreal]
  { weight: 3, build: (pick, maybe) => {
    let s = `A ${pick(G_MOODS)} ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` with a ${pick(G_MATERIALS)} ${pick(G_OBJECTS)}`;
    s += ` and ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS_PLURAL)}`;
    if (maybe(0.7)) s += ` during ${pick(G_ATMOSPHERE)}`;
    if (maybe(0.5)) s += ` surrounded by ${pick(G_ENV_FEATURES)}`;
    if (maybe(0.3)) s += ` ${pick(G_SURREAL)}`;
    return s;
  }},
  // Pattern 4: layered — objects in [environment] [relation] [environment] + features
  { weight: 2, build: (pick, maybe) => {
    let s = `${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS_PLURAL)} and a ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS)}`;
    s += ` in a ${pick(G_SCALES)} ${pick(G_PLACES)}`;
    s += ` beside a ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    if (maybe(0.6)) s += ` with ${pick(G_ENV_FEATURES)}`;
    if (maybe(0.5)) s += ` ${pick(G_TIMES)}`;
    if (maybe(0.4)) s += ` ${pick(G_SURREAL)}`;
    return s;
  }},
  // Pattern 5: surreal place + material objects + inhabitants + weather
  { weight: 2, build: (pick, maybe) => {
    let s = `A ${pick(G_SURREAL_MODIFIERS)} ${pick(G_PLACES)} with ${pick(G_MATERIALS)} ${pick(G_OBJECTS_PLURAL)}`;
    s += ` and ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS)}`;
    if (maybe(0.6)) s += ` surrounded by ${pick(G_ENV_FEATURES)}`;
    s += ` ${pick(G_TIMES)}`;
    if (maybe(0.5)) s += ` where ${pick(G_INHABITANTS)} are ${pick(G_ACTIONS).split(" ").slice(0, 2).join(" ")}`;
    return s;
  }},
  // Pattern 6: two connected places with spatially-defined relationship
  { weight: 2, build: (pick, maybe) => {
    let s = `A ${pick(G_SCALES)} ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` ${pick(G_SPATIAL_RELATIONS)} a ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` with ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS_PLURAL)}`;
    if (maybe(0.5)) s += ` and a ${pick(G_MATERIALS)} ${pick(G_OBJECTS)}`;
    if (maybe(0.5)) s += ` during ${pick(G_ATMOSPHERE)}`;
    if (maybe(0.3)) s += ` ${pick(G_SURREAL)}`;
    return s;
  }},
  // Pattern 7: environment filled with objects + atmosphere + surreal
  { weight: 2, build: (pick, maybe) => {
    let s = `A ${pick(G_MOODS)} ${pick(G_PLACES)} filled with ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS_PLURAL)}`;
    s += ` and ${pick(G_MATERIALS)} ${pick(G_OBJECTS)}`;
    s += ` under a ${pick(G_DESCRIPTORS)} sky`;
    if (maybe(0.6)) s += ` during ${pick(G_ATMOSPHERE)}`;
    if (maybe(0.4)) s += ` ${pick(G_SURREAL)}`;
    return s;
  }},
  // Pattern 8: epic scene — 6-7 parts
  { weight: 2, build: (pick, maybe) => {
    let s = `A ${pick(G_SCALES)} ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` above a ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` with ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS_PLURAL)}`;
    s += ` and a ${pick(G_MATERIALS)} ${pick(G_OBJECTS)}`;
    s += ` during a ${pick(G_ATMOSPHERE)} ${pick(G_TIMES).replace("at ", "")}`;
    if (maybe(0.5)) s += ` surrounded by ${pick(G_ENV_FEATURES)}`;
    if (maybe(0.4)) s += ` ${pick(G_SURREAL)}`;
    return s;
  }},
  // Pattern 9: surreal-heavy dream with inhabitants
  { weight: 1, build: (pick, maybe) => {
    let s = `A ${pick(G_SURREAL_MODIFIERS)} ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` with ${pick(G_SURREAL_MODIFIERS)} ${pick(G_OBJECTS_PLURAL)}`;
    s += ` beside ${pick(G_ENV_FEATURES)}`;
    s += ` ${pick(G_SURREAL)}`;
    if (maybe(0.5)) s += ` where ${pick(G_INHABITANTS)} are ${pick(G_ACTIONS).split(" ").slice(0, 3).join(" ")}`;
    return s;
  }},
  // Pattern 10: structure inside place + objects + env features + time
  { weight: 1, build: (pick, maybe) => {
    let s = `A ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS)} inside a ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` with ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS_PLURAL)}`;
    if (maybe(0.7)) s += ` and ${pick(G_ENV_FEATURES)}`;
    if (maybe(0.5)) s += ` ${pick(G_TIMES)}`;
    if (maybe(0.4)) s += ` during ${pick(G_ATMOSPHERE)}`;
    return s;
  }},
  // Pattern 11 (15E): inhabited environment — place with creatures + mood + features
  { weight: 2, build: (pick, maybe) => {
    let s = `A ${pick(G_MOODS)} ${pick(G_PLACES)} inhabited by ${pick(G_INHABITANTS)}`;
    s += ` ${pick(G_ACTIONS)}`;
    s += ` with ${pick(G_DESCRIPTORS)} ${pick(G_OBJECTS_PLURAL)}`;
    if (maybe(0.6)) s += ` and ${pick(G_ENV_FEATURES)}`;
    if (maybe(0.5)) s += ` ${pick(G_TIMES)}`;
    return s;
  }},
  // Pattern 12 (15E): material-rich scene — multiple materials + structure + environment
  { weight: 1, build: (pick, maybe) => {
    let s = `A ${pick(G_MATERIALS)} ${pick(G_OBJECTS)} and ${pick(G_MATERIALS)} ${pick(G_OBJECTS_PLURAL)}`;
    s += ` in a ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    s += ` ${pick(G_SPATIAL_RELATIONS)} a ${pick(G_DESCRIPTORS)} ${pick(G_PLACES)}`;
    if (maybe(0.6)) s += ` during ${pick(G_ATMOSPHERE)}`;
    if (maybe(0.5)) s += ` ${pick(G_SURREAL)}`;
    return s;
  }},
];

export function generateRandomDream(): string {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const maybe = (p: number): boolean => Math.random() < p;

  // Weighted template selection
  const totalWeight = DREAM_TEMPLATES.reduce((sum, t) => sum + t.weight, 0);
  let r = Math.random() * totalWeight;
  let template = DREAM_TEMPLATES[0];
  for (const t of DREAM_TEMPLATES) {
    r -= t.weight;
    if (r <= 0) { template = t; break; }
  }

  return template.build(pick, maybe);
}

// ── Coverage test samples (used by debug mode) ───────────────────────
export const COVERAGE_SAMPLES = [
  "A ruined citadel above a stormy sea",
  "A luminous forest with crystal ruins",
  "A neon metropolis in the rain",
  "A frozen temple inside a mountain cavern",
  "A surreal void with floating mirrors and giant moons",
  "A calm village beside a glowing lake at dusk",
  "An endless desert with broken towers and crimson skies",
  "A haunted crypt beneath a forgotten castle",
  "An overgrown jungle with golden statues and vine bridges",
  "A shattered glacier under aurora lights",
  "A whispering library filled with floating books",
  "A massive volcano above an emerald forest",
  "A mirrored dreamscape with inverted towers",
  "A tiny island surrounded by endless ocean at sunset",
  "A mechanical city with copper towers and pulsing lights",
];
