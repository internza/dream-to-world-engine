export type ConceptType = "place" | "object" | "descriptor" | "weather" | "celestial" | "mood";

export interface ConceptEntry {
  canonical: string;
  type: "place" | "object" | "descriptor";
  synonyms: string[];
  related?: string[];
  generatorHint?: string;
}

// ── Concept database ──────────────────────────────────────────────────
// Each entry maps synonyms to a canonical term already understood by the
// renderer's dictionary generators or the classifyWord lists.

const CONCEPTS: ConceptEntry[] = [
  // ─── Places ─────────────────────────────────────────────────────────
  { canonical: "city",    type: "place", synonyms: ["metropolis", "downtown", "urban", "town", "cityscape"],     generatorHint: "city" },
  { canonical: "forest",  type: "place", synonyms: ["woodland", "woods", "grove", "thicket", "timberland"],      generatorHint: "forest" },
  { canonical: "ocean",   type: "place", synonyms: ["sea", "waters", "abyss", "deep"],                           generatorHint: "ocean" },
  { canonical: "beach",   type: "place", synonyms: ["seaside", "shore", "coast", "coastline", "shoreline", "seashore"], generatorHint: "beach" },
  { canonical: "mountain",type: "place", synonyms: ["peak", "summit", "ridge", "highland", "mount"],             generatorHint: "mountain" },
  { canonical: "desert",  type: "place", synonyms: ["wasteland", "dunes", "badlands", "sands"],                  generatorHint: "desert" },
  { canonical: "castle",  type: "place", synonyms: ["fortress", "citadel", "stronghold", "keep", "fort"],        generatorHint: "castle" },
  { canonical: "clouds",  type: "place", synonyms: ["mist", "fog", "haze", "vapor", "cloudscape"],               generatorHint: "clouds" },
  { canonical: "cave",    type: "place", synonyms: ["cavern", "grotto", "underground", "catacombs"],             related: ["dark", "stone"] },
  { canonical: "garden",  type: "place", synonyms: ["orchard", "meadow", "glade", "clearing", "park"],          generatorHint: "garden" },
  { canonical: "temple",  type: "place", synonyms: ["shrine", "sanctuary", "chapel", "cathedral", "church", "monastery"], related: ["sacred", "ancient"] },
  { canonical: "village",  type: "place", synonyms: ["hamlet", "settlement", "outpost"],                          related: ["house"] },
  { canonical: "palace",   type: "place", synonyms: ["manor", "mansion", "estate", "chateau"],                    related: ["castle"] },
  { canonical: "lake",     type: "place", synonyms: ["pond", "lagoon", "reservoir"],                              generatorHint: "lake" },
  { canonical: "river",    type: "place", synonyms: ["stream", "creek", "brook", "waterfall", "rapids"],          generatorHint: "river" },
  { canonical: "island",   type: "place", synonyms: ["isle", "atoll", "archipelago"],                             related: ["ocean"] },
  { canonical: "valley",   type: "place", synonyms: ["dale", "ravine", "gorge", "basin"],                        related: ["mountain"] },
  { canonical: "sky",      type: "place", synonyms: ["heavens", "firmament", "atmosphere"],                       related: ["clouds"] },
  { canonical: "space",    type: "place", synonyms: ["cosmos", "universe", "galaxy", "nebula", "void"],           related: ["stars", "surreal"] },
  { canonical: "cliff",    type: "place", synonyms: ["bluff", "precipice", "escarpment", "crag"],                 related: ["mountain"] },
  { canonical: "jungle",   type: "place", synonyms: ["rainforest", "tropics"],                                    related: ["forest"] },
  { canonical: "street",   type: "place", synonyms: ["road", "path", "alley", "lane", "avenue", "boulevard", "highway"], related: ["city"] },

  // ─── Objects ────────────────────────────────────────────────────────
  { canonical: "tower",    type: "object", synonyms: ["towers", "skyscraper", "skyscrapers", "spire", "spires", "minaret", "obelisk", "monolith"], generatorHint: "tower" },
  { canonical: "ruins",    type: "object", synonyms: ["ruin", "wreckage", "rubble", "debris", "remnants", "remains"], generatorHint: "ruins" },
  { canonical: "tree",     type: "object", synonyms: ["trees", "oak", "pine", "willow", "redwood", "sapling"],   generatorHint: "tree" },
  { canonical: "bridge",   type: "object", synonyms: ["bridges", "overpass", "viaduct", "arch"],                 generatorHint: "bridge" },
  { canonical: "stone",    type: "object", synonyms: ["stones", "boulder", "boulders", "pebble", "pebbles", "slab", "slabs"], generatorHint: "stone" },
  { canonical: "crystal",  type: "object", synonyms: ["crystals", "gem", "gems", "gemstone", "jewel", "prism", "shard", "shards"], generatorHint: "crystal" },
  { canonical: "fragments",type: "object", synonyms: ["fragment", "pieces", "splinters", "chips"],               generatorHint: "fragments" },
  { canonical: "statue",   type: "object", synonyms: ["statues", "sculpture", "idol", "effigy", "figure", "figurine"], generatorHint: "statue" },
  { canonical: "pillar",   type: "object", synonyms: ["pillars", "column", "columns", "pedestal"],               generatorHint: "pillar" },
  { canonical: "gate",     type: "object", synonyms: ["gates", "portal", "portals", "gateway", "doorway", "entrance"], generatorHint: "gate" },
  { canonical: "wall",     type: "object", synonyms: ["walls", "barrier", "rampart", "parapet", "battlement"],    related: ["castle"] },
  { canonical: "building", type: "object", synonyms: ["buildings", "structure", "structures", "edifice"],          related: ["city"] },
  { canonical: "rock",     type: "object", synonyms: ["rocks", "crag"],                                           generatorHint: "rock" },
  { canonical: "ship",     type: "object", synonyms: ["boat", "vessel", "galleon", "raft"],                       related: ["ocean"] },
  { canonical: "door",     type: "object", synonyms: ["trapdoor", "hatch"],                                       related: ["house"] },
  { canonical: "orb",      type: "object", synonyms: ["sphere", "globe", "ball"],                                 related: ["crystal", "bright"] },
  { canonical: "throne",   type: "object", synonyms: ["seat"],                                                    related: ["castle", "palace"] },
  { canonical: "altar",    type: "object", synonyms: ["pedestal"],                                                related: ["temple", "sacred"] },
  { canonical: "sword",    type: "object", synonyms: ["blade", "dagger", "weapon"],                               related: ["ancient"] },
  { canonical: "monument", type: "object", synonyms: ["memorial", "tombstone", "gravestone", "headstone"],         related: ["ancient"] },
  { canonical: "lantern",  type: "object", synonyms: ["lamp", "torch", "candle", "beacon", "lighthouse"],         related: ["bright"] },

  // ─── Descriptors ────────────────────────────────────────────────────
  { canonical: "bright",   type: "descriptor", synonyms: ["glowing", "luminous", "radiant", "shining", "brilliant", "gleaming", "incandescent", "lit"], related: ["glass"] },
  { canonical: "dark",     type: "descriptor", synonyms: ["shadowy", "dim", "gloomy", "murky", "pitch", "obsidian", "ebon"], related: ["night"] },
  { canonical: "ancient",  type: "descriptor", synonyms: ["old", "timeless", "primordial", "prehistoric", "archaic", "antique", "weathered"], related: ["ruins"] },
  { canonical: "floating", type: "descriptor", synonyms: ["hovering", "levitating", "airborne", "drifting", "suspended", "weightless"] },
  { canonical: "giant",    type: "descriptor", synonyms: ["huge", "enormous", "colossal", "immense", "towering", "titanic", "gargantuan"] },
  { canonical: "glass",    type: "descriptor", synonyms: ["transparent", "translucent", "crystalline", "prismatic", "vitreous"], related: ["crystal"] },
  { canonical: "golden",   type: "descriptor", synonyms: ["gold", "gilded", "amber", "aureate"] },
  { canonical: "silver",   type: "descriptor", synonyms: ["platinum", "chrome", "metallic", "steel", "iron"] },
  { canonical: "neon",     type: "descriptor", synonyms: ["fluorescent", "electric", "vivid", "cyberpunk"], related: ["city", "bright"] },
  { canonical: "purple",   type: "descriptor", synonyms: ["violet", "indigo", "lavender", "magenta", "amethyst"] },
  { canonical: "futuristic", type: "descriptor", synonyms: ["scifi", "advanced", "technological", "cyber", "digital"] },
  { canonical: "ruined",   type: "descriptor", synonyms: ["crumbling", "decayed", "dilapidated", "desolate", "demolished", "destroyed"], related: ["ruins"] },
  { canonical: "frozen",   type: "descriptor", synonyms: ["icy", "glacial", "frigid", "arctic", "wintry", "frost", "frosty"] },
  { canonical: "burning",  type: "descriptor", synonyms: ["fiery", "blazing", "flaming", "infernal", "molten", "volcanic", "lava"] },
  { canonical: "quiet",    type: "descriptor", synonyms: ["silent", "peaceful", "serene", "calm", "tranquil", "hushed", "still"] },
  { canonical: "endless",  type: "descriptor", synonyms: ["infinite", "boundless", "eternal", "limitless", "vast", "sprawling", "unending"] },
  { canonical: "magical",  type: "descriptor", synonyms: ["enchanted", "mystical", "arcane", "sorcerous", "spellbound", "bewitched"] },
  { canonical: "ethereal", type: "descriptor", synonyms: ["ghostly", "spectral", "phantom", "wraithlike", "otherworldly", "transcendent"] },
  { canonical: "hidden",   type: "descriptor", synonyms: ["secret", "concealed", "obscured", "veiled", "cloaked", "shrouded"] },
  { canonical: "sacred",   type: "descriptor", synonyms: ["holy", "divine", "blessed", "consecrated", "hallowed"] },
  { canonical: "surreal",  type: "descriptor", synonyms: ["dreamlike", "bizarre", "psychedelic", "fantastical", "hallucinatory", "trippy", "astral", "cosmic"] },
  { canonical: "misty",    type: "descriptor", synonyms: ["foggy", "hazy", "smoky", "clouded", "nebulous"] },
  { canonical: "massive",  type: "descriptor", synonyms: ["monumental", "imposing", "grand", "majestic", "grandiose"] },

  // ─── Weather / Celestial (mapped as descriptors for parser) ────────
  { canonical: "rain",     type: "descriptor", synonyms: ["rainy", "raining", "downpour", "drizzle", "shower", "monsoon"] },
  { canonical: "storm",    type: "descriptor", synonyms: ["stormy", "tempest", "hurricane", "cyclone", "thunderstorm"] },
  { canonical: "thunder",  type: "descriptor", synonyms: ["lightning", "thundering", "thunderous"] },
  { canonical: "snow",     type: "descriptor", synonyms: ["snowy", "snowing", "blizzard", "sleet", "hail", "flurry"] },
  { canonical: "night",    type: "descriptor", synonyms: ["midnight", "nocturnal", "nighttime", "nightfall"] },
  { canonical: "moon",     type: "descriptor", synonyms: ["moonlit", "moonlight", "lunar", "crescent"] },
  { canonical: "stars",    type: "descriptor", synonyms: ["starry", "starlight", "starlit", "constellation", "constellations"] },
  { canonical: "sun",      type: "descriptor", synonyms: ["sunny", "sunlit", "sunlight", "solar", "daylight"] },
  { canonical: "sunset",   type: "descriptor", synonyms: ["dusk", "twilight", "dawn", "sunrise", "daybreak"] },
];

// ── Lookup indices (built once) ───────────────────────────────────────

const synonymIndex = new Map<string, ConceptEntry>();
const canonicalIndex = new Map<string, ConceptEntry>();

for (const entry of CONCEPTS) {
  canonicalIndex.set(entry.canonical, entry);
  for (const syn of entry.synonyms) {
    synonymIndex.set(syn, entry);
  }
}

// ── Public API ────────────────────────────────────────────────────────

export interface CanonicalResult {
  canonical: string;
  type?: "place" | "object" | "descriptor";
  generatorHint?: string;
}

/**
 * Look up a single token and return its canonical form, type, and
 * optional generator hint. Returns the token unchanged if unknown.
 */
export function canonicalizeToken(token: string): CanonicalResult {
  // Already a known canonical term?
  const direct = canonicalIndex.get(token);
  if (direct) {
    return { canonical: direct.canonical, type: direct.type, generatorHint: direct.generatorHint };
  }

  // Synonym lookup
  const entry = synonymIndex.get(token);
  if (entry) {
    return { canonical: entry.canonical, type: entry.type, generatorHint: entry.generatorHint };
  }

  // Simple plural stripping: towers -> tower, etc.
  if (token.endsWith("s") && token.length > 3) {
    const singular = token.slice(0, -1);
    const singDirect = canonicalIndex.get(singular);
    if (singDirect) return { canonical: singDirect.canonical, type: singDirect.type, generatorHint: singDirect.generatorHint };
    const singEntry = synonymIndex.get(singular);
    if (singEntry) return { canonical: singEntry.canonical, type: singEntry.type, generatorHint: singEntry.generatorHint };
  }

  return { canonical: token };
}

/**
 * Return the full concept entry for a canonical name, or undefined.
 */
export function getConceptEntry(canonical: string): ConceptEntry | undefined {
  return canonicalIndex.get(canonical);
}
