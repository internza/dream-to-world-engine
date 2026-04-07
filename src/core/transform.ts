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

// ── 17A: Scene type classification ───────────────────────────────────
export type SceneType =
  | "beach" | "city" | "forest" | "mountain" | "cave"
  | "arena" | "temple" | "interior" | "surreal" | "ocean"
  | "desert" | "frozen" | "sky" | "generic";

export interface WorldModel {
  entities: WorldEntity[];
  relationships: WorldRelation[];
  semantics: SemanticTags;
  archetype: EnvironmentArchetype;
  primaryLandmarkId: string | null;
  dreamProfile: DreamProfile;
  sceneType: SceneType;
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
    .replace(/\bwon't\b/g, "will not")
    // 19A: Multi-word phrase collapsing — merge compound concepts
    .replace(/\bschool\s+hallway\b/g, "hallway school")
    .replace(/\bhospital\s+corridor\b/g, "corridor hospital")
    .replace(/\bcity\s+street[s]?\b/g, "street city")
    .replace(/\bfloating\s+island[s]?\b/g, "floating island")
    .replace(/\bocean\s+floor\b/g, "ocean")
    .replace(/\bdeep\s+sea\b/g, "deep ocean")
    .replace(/\bopen\s+field[s]?\b/g, "vast field")
    .replace(/\btrain\s+station\b/g, "station")
    .replace(/\bbus\s+stop\b/g, "station")
    .replace(/\bparking\s+lot\b/g, "plaza")
    .replace(/\bshopping\s+mall\b/g, "bazaar")
    .replace(/\btown\s+square\b/g, "plaza")
    .replace(/\bclock\s+tower\b/g, "clock tower");
}

// ── 19A: Crowd / population / density hints from text ────────────────
const CROWD_WORDS = new Set([
  "crowded", "bustling", "packed", "teeming", "swarming",
  "busy", "populated", "full", "overflowing", "thriving"
]);
const MANY_PHRASES = /\b(lots?\s+of|many|hundreds?\s+of|thousands?\s+of|crowd\s+of|swarm\s+of|group\s+of)\b/;
const EMPTY_WORDS = new Set([
  "empty", "deserted", "barren", "abandoned", "desolate",
  "lonely", "solitary", "isolated", "vacant", "hollow"
]);

// ── 19A: Interior-indicating words ───────────────────────────────────
const INTERIOR_WORDS = new Set([
  "hallway", "corridor", "room", "classroom", "office",
  "lobby", "warehouse", "basement", "school", "hospital",
  "shop", "library", "house", "mansion",
  "building", "prison",
  "vault", "cellar", "atrium",
  "monastery", "barracks", "tavern", "inn"
]);

function detectCrowdHint(text: string): "crowded" | "empty" | "none" {
  const lower = text.toLowerCase();
  if (MANY_PHRASES.test(lower)) return "crowded";
  const words = lower.split(/\s+/);
  if (words.some((w) => CROWD_WORDS.has(w))) return "crowded";
  if (words.some((w) => EMPTY_WORDS.has(w))) return "empty";
  return "none";
}

function detectInteriorHint(entities: WorldEntity[], relationships: WorldRelation[]): boolean {
  // Check for explicit interior-indicating entity names
  const names = new Set(entities.map((e) => e.attributes.name));
  if ([...names].some((n) => INTERIOR_WORDS.has(n))) return true;
  // Check for "inside" relationships pointing to an interior-capable place
  const entityById = new Map(entities.map((e) => [e.id, e]));
  return relationships.some((r) => {
    if (r.type !== "inside") return false;
    const target = entityById.get(r.to);
    return target ? INTERIOR_WORDS.has(target.attributes.name) : false;
  });
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
    "volcano", "plateau", "reef", "rooftop",
    "hallway", "corridor", "classroom", "office", "lobby",
    "warehouse", "basement", "school", "hospital", "shop"
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

  // 19A: Detect crowd/density hint from original text before tokenization
  const crowdHint = detectCrowdHint(dream);

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

  const semantics = inferSemantics(entities, crowdHint);
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

  // ── 17A: Scene type classification ────────────────────────────────
  const sceneType = classifySceneType(entities, semantics, relationships);

  return { entities, relationships, semantics, archetype, primaryLandmarkId, dreamProfile, sceneType };
}

// ── 17A/19A: Scene type classification with relationship context ─────
function classifySceneType(entities: WorldEntity[], semantics: SemanticTags, relationships: WorldRelation[]): SceneType {
  const names = new Set(entities.map((e) => e.attributes.name));

  // 20B: Interior scenes removed — remap to city/temple fallback
  // (interior detection is now bypassed; interior keywords map to city)

  // Priority-ordered rules: first match wins
  const rules: Array<[SceneType, string[]]> = [
    ["beach",    ["beach", "shore", "coast", "shoreline"]],
    ["ocean",    ["ocean", "sea", "reef", "harbor", "island"]],
    ["cave",     ["cave", "crypt", "dungeon", "grotto", "cavern", "basement"]],
    // 20B: Former interior keywords now map to city (strongest outdoor fallback)
    ["city",     ["school", "office", "room", "hallway", "library", "house", "building", "classroom", "bedroom", "kitchen", "corridor", "lobby", "warehouse", "hospital", "shop"]],
    ["arena",    ["arena", "colosseum", "stadium"]],
    ["temple",   ["temple", "cathedral", "shrine", "sanctuary", "church", "chapel", "altar"]],
    ["city",     ["city", "street", "village", "town", "plaza", "bazaar", "rooftop", "buildings", "metropolis"]],
    ["forest",   ["forest", "trees", "tree", "jungle", "garden", "woods"]],
    ["mountain", ["mountain", "cliff", "valley", "canyon", "volcano", "plateau", "mesa", "peak"]],
    ["desert",   ["desert", "oasis", "dunes", "sand", "savanna"]],
    ["frozen",   ["glacier", "tundra", "ice", "frozen"]],
    ["sky",      ["clouds", "cloud", "sky", "floating"]],
    ["surreal",  ["dreamscape", "void", "realm", "abyss", "labyrinth", "mirror"]],
  ];

  for (const [scene, keywords] of rules) {
    if (keywords.some((k) => names.has(k))) return scene;
  }

  // Fallback from semantics.environment
  const envMap: Partial<Record<EnvironmentType, SceneType>> = {
    ocean: "ocean", coastal: "beach", forest: "forest", city: "city",
    sky: "sky", mountain: "mountain", desert: "desert", cave: "cave",
    frozen: "frozen", ruins: "temple", surreal: "surreal", void: "surreal",
  };
  return envMap[semantics.environment] ?? "generic";
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

// ── Semantic tag inference (expanded Iter 16/19A) ─────────────────────
function inferSemantics(entities: WorldEntity[], crowdHint: "crowded" | "empty" | "none" = "none"): SemanticTags {
  const names = new Set(entities.map((e) => e.attributes.name));
  const all = [...names];

  // ── Environment ────────────────────────────────────────────────────
  const envRules: Array<[EnvironmentType, string[]]> = [
    ["ocean",     ["ocean", "sea"]],
    ["coastal",   ["beach", "harbor", "reef", "island", "shore", "coast", "lighthouse"]],
    ["forest",    ["forest", "trees", "tree", "jungle", "garden", "marsh"]],
    ["city",      ["city", "street", "village", "building", "buildings", "plaza", "bazaar", "rooftop", "school", "hospital", "shop", "house", "office", "warehouse", "library", "hallway", "corridor"]],
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

  // ── Density (Iter 16 + 19A crowd hint) ──────────────────────────────
  let density: DensityPreset = "balanced";
  // 19A: Crowd hint from text phrases takes priority
  if (crowdHint === "crowded") density = "dense";
  else if (crowdHint === "empty") density = "sparse";
  else if (all.some((n) => ["endless", "infinite", "vast", "dense"].includes(n))) density = "dense";
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

// ── 22: Curated high-quality dream list ──────────────────────────────

const CURATED_DREAMS: string[] = [
  // ── Featured — strong presence (reliable fallbacks) ──────────────
  "I'm at a rocky coast with a lighthouse and stone stairs, and a storm is forming with strong winds and dark clouds",
  "I'm near a river with a bridge and trees while sunlight reflects off the water",
  "A tropical island with warm lighthouse and driftwood surrounded by sea caves under starlight",
  "I'm standing on a rooftop in a city above the clouds, and everything is covered in mist with soft light coming through",
  "I'm standing on a cliff at the edge of the sea while a storm rolls in and waves crash against the rocks below",
  "I'm in a stone courtyard with a tall gate and ivy-covered walls while a cold wind blows through at dusk",
  "I'm in a garden with fountains and lanterns while petals fall under a night sky",
  "I'm at a wooden dock on a foggy lake at dawn with rowboats tied along the pier and trees rising behind them",
  "I'm inside a cathedral with high arched ceilings and long windows while rain streams down the glass outside",
  "I'm standing in a field of tall grass with a farmhouse and windmill while thunderclouds gather at the horizon",
  "I'm on a cobblestone road through a quiet village with stone fences and open doors while snow falls silently",
  "I'm at the mouth of a sea cave with tidal pools and barnacled rocks while waves push in with each gust",
  "I'm crossing a rope bridge over a canyon while mist rises from the river far below and wind sways the planks",
  "I'm standing on a hilltop with a ruined watchtower while the sun sets behind distant mountains and the ground is dry",

  // Beach / Ocean
  "I'm on a warm beach with a tall lighthouse, wooden docks, and turtles walking along the shore while the sky turns orange at sunset",
  "I'm standing on a tropical island with palm trees and a small village, and it's lightly raining while waves crash against nearby cliffs",
  "I'm walking along a quiet shoreline with a broken pier and scattered boats, and there's fog rolling in from the ocean at dawn",
  "I'm exploring a beach with coral structures and wooden huts, and the tide is glowing under a starry night sky",
  "I'm near a harbor with ships and cranes, and it's raining while lanterns reflect across the water",
  "I'm on a small island with cliffs and a watchtower, and waves are crashing below during a windy sunset",
  "I'm walking through a coastal village with wooden houses and bridges while mist drifts through the air",
  "I'm standing by a quiet bay with docks and anchored ships, and everything is calm with light fog in the morning",
  "I'm on a beach with caves carved into cliffs, and rain is falling while waves echo inside the caves",

  // City
  "I'm walking through a neon city with tall buildings and bridges, and it's raining while lights reflect off the streets at night",
  "I'm standing on a rooftop in a city above the clouds, and everything is covered in mist with soft light coming through",
  "I'm walking through a busy harbor city with docks and a lighthouse while the sky turns orange at sunset",
  "I'm in a futuristic city with glass towers and floating structures while rain falls and everything glows",
  "I'm in a quiet stone city with empty streets and arches while fog slowly moves through the buildings",
  "I'm walking through a city plaza with a fountain and statues while it's lightly snowing",
  "I'm in a tall vertical city with stacked platforms and bridges while clouds move between the buildings",
  "I'm exploring a ruined city with broken towers and vines while thunder echoes in the distance",
  "I'm walking down a street filled with lanterns and shops while rain falls steadily at night",

  // Forest
  "I'm walking through a dense forest with tall trees and ruins while mist floats between everything",
  "I'm in an ancient forest with glowing mushrooms and stone structures while soft light shines through the trees",
  "I'm walking through a snowy forest with animals and frozen ruins while snow falls slowly",
  "I'm in a jungle with vine bridges and hidden temples while rain pours down heavily",
  "I'm standing in a quiet forest clearing with a stone altar while fireflies glow around me at night",
  "I'm walking through a foggy forest with twisted trees and roots while everything feels still",
  "I'm in a glowing forest with strange plants and soft light while the air feels surreal",
  "I'm exploring a forest with a river and stone bridge while leaves fall during sunset",
  "I'm in a dark forest with barely any light while distant sounds echo through the trees",
  "I'm walking through a peaceful woodland with a stream and flowers while the sky is bright and calm",

  // Mountain / Cave / Temple
  "I'm standing on a snowy mountain with a temple at the top while snow falls and wind moves through the area",
  "I'm inside a cave with glowing crystals and stone pillars while water drips from above",
  "I'm in a massive marble temple with tall columns and a throne while everything is lit by torches",
  "I'm exploring a cave system with tunnels and glowing walls while fog hangs in the air",
  "I'm at a mountain shrine with stone steps and flags while snow gently falls around me",
  "I'm inside a cavern with large crystal formations while beams of light shine through cracks above",
  "I'm exploring an ancient temple with broken pillars while rain falls through the open ceiling",
  "I'm inside a deep cave with echoes and glowing stones while everything feels quiet",

  // Surreal / Mixed
  "I'm in a floating city with inverted towers and bridges while clouds move all around me",
  "I'm in a strange world with floating staircases and structures while everything glows softly",
  "I'm walking through a surreal landscape with warped buildings while light bends in unusual ways",
  "I'm in a fragmented world with pieces of land floating while energy flows between them",
  "I'm in a dreamlike void with platforms and towers while everything slowly drifts",
  "I'm in a mirrored environment with reflections everywhere while light moves across surfaces",
  "I'm walking through a distorted city with curved buildings while rain falls sideways",
  "I'm exploring a world with broken geometry while objects hover in the air",
  "I'm in a surreal ocean where waves are frozen in place while light shines through them",

  // Mixed / Peaceful
  "I'm in a meadow with flowers and a small house while the sun sets and everything feels calm",
  "I'm standing near a lake with statues and trees while fog slowly moves across the water",
  "I'm in a garden with fountains and lanterns while petals fall under a night sky",
  "I'm in a quiet village with stone paths and houses while light rain falls",
  "I'm exploring a field with ruins and scattered structures while clouds move overhead",
  "I'm standing in an open field with distant mountains while wind moves through the grass",
  "I'm walking through a calm environment with structures and nature while everything feels quiet",

  // Additional entries for variety
  "I'm on a cliff above a stormy sea with a broken lighthouse while lightning strikes in the distance",
  "I'm in a frozen tundra with ice pillars and a distant fortress while aurora lights fill the sky",
  "I'm standing at the edge of a desert oasis with palm trees and a stone well while stars appear above",
  "I'm in a ruined cathedral with shattered stained glass and vines while moonlight pours through the ceiling",
  "I'm on a mountain trail with ancient stone markers while snow falls softly and mist fills the valley",
  "I'm inside a library tower with spiral stairs and floating books while rain taps against tall windows",
  "I'm at a harbor at dawn with fishing boats, wooden docks, and seagulls while mist clings to the water",
  "I'm in a sunken temple visible through clear shallow water while sunlight bends through the surface",
  "I'm walking through a bamboo forest with a stone path and a small shrine while rain drips from the leaves",
  "I'm on a volcanic island with black sand beaches and a glowing crater while the sea shimmers at night",
  "I'm in a canyon with towering red walls and a river below while eagles circle overhead in the morning light",
  "I'm standing in a courtyard of a palace with marble fountains and arched walkways while petals drift in the breeze",
  "I'm at the base of a waterfall in a jungle clearing with mossy rocks and a rope bridge while mist rises",
  "I'm in a mountain monastery with wooden bridges and prayer flags while clouds drift through the courtyard",
  "I'm on a glacier with blue ice crevasses and distant peaks while the sky glows pink at dusk",
  "I'm walking along a canal in a flooded city with gondolas and lanterns while fog hangs low at night",
  "I'm exploring a mesa at sunrise with sandstone arches and desert scrub while the sky turns red to gold",
  "I'm in a forest of giant mushrooms and bioluminescent plants beside a glowing pond while everything is still at night",
];

export function getRandomDream(): string {
  const dream = CURATED_DREAMS[Math.floor(Math.random() * CURATED_DREAMS.length)];
  console.debug("[DTWE] Selected dream:", dream);
  return dream;
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
