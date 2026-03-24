export type ConceptType = "place" | "object" | "descriptor" | "weather" | "celestial" | "mood" | "terrain" | "material" | "surreal";

export type GeneratorFamily =
  | "urban" | "forest" | "coastal" | "sky" | "ruins" | "mountains"
  | "desert" | "water" | "surreal_abstract" | "celestial"
  | "architecture" | "frozen" | "cave" | "organic";

export interface ConceptEntry {
  canonical: string;
  type: "place" | "object" | "descriptor";
  synonyms: string[];
  related?: string[];
  generatorHint?: string;
  generatorFamily?: GeneratorFamily;
  variant?: string;
}

// ── Concept database (Iteration 16 — expanded to ~190 entries) ───────
// Each entry maps synonyms to a canonical term. generatorFamily groups
// concepts into shared generator logic in the renderer.

const CONCEPTS: ConceptEntry[] = [
  // ═══════════════════════════════════════════════════════════════════
  //  PLACES  (~41 entries)
  // ═══════════════════════════════════════════════════════════════════

  // ─── Urban ────────────────────────────────────────────────────────
  { canonical: "city",     type: "place", synonyms: ["metropolis", "downtown", "urban", "town", "cityscape", "skyline"], generatorHint: "city", generatorFamily: "urban", variant: "city" },
  { canonical: "village",  type: "place", synonyms: ["hamlet", "settlement", "outpost", "township", "commune"],          generatorFamily: "urban", variant: "village" },
  { canonical: "street",   type: "place", synonyms: ["road", "alley", "lane", "avenue", "boulevard", "highway"],        generatorFamily: "urban", variant: "street" },
  { canonical: "plaza",    type: "place", synonyms: ["square", "courtyard", "quadrangle", "piazza", "forum"],           generatorFamily: "urban", variant: "plaza" },
  { canonical: "bazaar",   type: "place", synonyms: ["market", "marketplace", "souk", "emporium"],                      generatorFamily: "urban", variant: "bazaar" },
  { canonical: "rooftop",  type: "place", synonyms: ["rooftops", "housetop"],                                           generatorFamily: "urban", variant: "rooftop" },

  // ─── Forest / Nature ──────────────────────────────────────────────
  { canonical: "forest",   type: "place", synonyms: ["woodland", "woods", "grove", "thicket", "timberland", "copse"],   generatorHint: "forest", generatorFamily: "forest", variant: "forest" },
  { canonical: "jungle",   type: "place", synonyms: ["rainforest", "tropics", "tropical"],                              generatorFamily: "forest", variant: "jungle" },
  { canonical: "garden",   type: "place", synonyms: ["orchard", "meadow", "glade", "clearing", "park", "arboretum"],    generatorHint: "garden", generatorFamily: "forest", variant: "garden" },
  { canonical: "field",    type: "place", synonyms: ["prairie", "steppe", "grassland", "pasture", "savanna", "plain", "plains"], generatorFamily: "forest", variant: "field" },
  { canonical: "marsh",    type: "place", synonyms: ["swamp", "wetland", "bog", "fen", "bayou", "mire", "quagmire"],    generatorFamily: "forest", variant: "marsh" },

  // ─── Coastal ──────────────────────────────────────────────────────
  { canonical: "beach",    type: "place", synonyms: ["seaside", "shore", "coast", "coastline", "shoreline", "seashore"], generatorHint: "beach", generatorFamily: "coastal", variant: "sand" },
  { canonical: "harbor",   type: "place", synonyms: ["port", "dock", "wharf", "pier", "marina", "quay"],                generatorFamily: "coastal", variant: "harbor" },
  { canonical: "reef",     type: "place", synonyms: ["coral", "atoll", "shoal"],                                        generatorFamily: "coastal", variant: "reef" },
  { canonical: "island",   type: "place", synonyms: ["isle", "archipelago", "islet"],                                   generatorFamily: "coastal", variant: "island" },

  // ─── Water ────────────────────────────────────────────────────────
  { canonical: "ocean",    type: "place", synonyms: ["sea", "waters", "deep"],                                          generatorHint: "ocean", generatorFamily: "water", variant: "ocean" },
  { canonical: "lake",     type: "place", synonyms: ["pond", "reservoir", "loch"],                                      generatorHint: "lake",  generatorFamily: "water", variant: "lake" },
  { canonical: "river",    type: "place", synonyms: ["stream", "creek", "brook", "waterfall", "rapids", "tributary"],    generatorHint: "river", generatorFamily: "water", variant: "river" },

  // ─── Sky / Ethereal ───────────────────────────────────────────────
  { canonical: "clouds",   type: "place", synonyms: ["cloud", "haze", "vapor", "cloudscape"],                           generatorHint: "clouds", generatorFamily: "sky", variant: "clouds" },
  { canonical: "sky",      type: "place", synonyms: ["heavens", "firmament", "atmosphere", "stratosphere"],              generatorFamily: "sky", variant: "sky" },

  // ─── Mountains / Heights ──────────────────────────────────────────
  { canonical: "mountain", type: "place", synonyms: ["peak", "summit", "ridge", "highland", "mount"],                   generatorHint: "mountain", generatorFamily: "mountains", variant: "mountain" },
  { canonical: "cliff",    type: "place", synonyms: ["bluff", "precipice", "escarpment", "crag", "ledge"],              generatorFamily: "mountains", variant: "cliff" },
  { canonical: "canyon",   type: "place", synonyms: ["gorge", "ravine", "chasm", "rift", "crevasse"],                   generatorFamily: "mountains", variant: "canyon" },
  { canonical: "valley",   type: "place", synonyms: ["dale", "basin", "glen", "dell"],                                  generatorFamily: "mountains", variant: "valley" },
  { canonical: "volcano",  type: "place", synonyms: ["crater", "caldera"],                                              generatorFamily: "mountains", variant: "volcano" },
  { canonical: "plateau",  type: "place", synonyms: ["mesa", "tableland", "butte"],                                     generatorFamily: "mountains", variant: "plateau" },

  // ─── Desert ───────────────────────────────────────────────────────
  { canonical: "desert",   type: "place", synonyms: ["wasteland", "dunes", "badlands", "sands", "barrens"],             generatorHint: "desert", generatorFamily: "desert", variant: "desert" },
  { canonical: "oasis",    type: "place", synonyms: ["watering hole"],                                                  generatorFamily: "desert", variant: "oasis" },

  // ─── Frozen ───────────────────────────────────────────────────────
  { canonical: "glacier",  type: "place", synonyms: ["icefield", "icesheet", "icecap"],                                 generatorFamily: "frozen", variant: "glacier" },
  { canonical: "tundra",   type: "place", synonyms: ["permafrost", "snowfield"],                                        generatorFamily: "frozen", variant: "tundra" },

  // ─── Architecture ─────────────────────────────────────────────────
  { canonical: "castle",   type: "place", synonyms: ["fortress", "citadel", "stronghold", "keep", "fort", "bastion"],   generatorHint: "castle", generatorFamily: "architecture", variant: "castle" },
  { canonical: "temple",   type: "place", synonyms: ["shrine", "sanctuary", "chapel", "cathedral", "church", "monastery", "pagoda"], generatorFamily: "architecture", variant: "temple" },
  { canonical: "palace",   type: "place", synonyms: ["manor", "mansion", "estate", "chateau", "royal"],                 generatorFamily: "architecture", variant: "palace" },
  { canonical: "library",  type: "place", synonyms: ["archive", "repository", "scriptorium", "athenaeum"],              generatorFamily: "architecture", variant: "library" },
  { canonical: "arena",    type: "place", synonyms: ["colosseum", "amphitheater", "stadium", "coliseum"],               generatorFamily: "architecture", variant: "arena" },

  // ─── Cave / Underground ───────────────────────────────────────────
  { canonical: "cave",     type: "place", synonyms: ["cavern", "grotto", "underground", "catacombs"],                   generatorFamily: "cave", variant: "cave" },
  { canonical: "crypt",    type: "place", synonyms: ["tomb", "mausoleum", "sepulcher", "necropolis", "burial"],         generatorFamily: "cave", variant: "crypt" },
  { canonical: "dungeon",  type: "place", synonyms: ["prison", "cell", "vault", "oubliette"],                           generatorFamily: "cave", variant: "dungeon" },

  // ─── Surreal / Void ───────────────────────────────────────────────
  { canonical: "space",      type: "place", synonyms: ["cosmos", "universe", "galaxy", "nebula", "void"],               generatorFamily: "celestial", variant: "cosmos" },
  { canonical: "dreamscape", type: "place", synonyms: ["dreamworld", "mindscape", "subconscious"],                      generatorFamily: "surreal_abstract", variant: "dreamscape" },
  { canonical: "realm",      type: "place", synonyms: ["dimension", "plane", "domain", "limbo", "purgatory"],           generatorFamily: "surreal_abstract", variant: "realm" },

  // ═══════════════════════════════════════════════════════════════════
  //  OBJECTS  (~51 entries)
  // ═══════════════════════════════════════════════════════════════════

  // ─── Architecture / Structure ─────────────────────────────────────
  { canonical: "tower",      type: "object", synonyms: ["towers", "skyscraper", "skyscrapers", "spire", "spires", "minaret", "obelisk", "monolith"], generatorHint: "tower", generatorFamily: "architecture", variant: "tower" },
  { canonical: "bridge",     type: "object", synonyms: ["bridges", "overpass", "viaduct"],                              generatorHint: "bridge", generatorFamily: "architecture", variant: "bridge" },
  { canonical: "gate",       type: "object", synonyms: ["gates", "portal", "portals", "gateway", "doorway", "entrance"], generatorHint: "gate", generatorFamily: "architecture", variant: "gate" },
  { canonical: "wall",       type: "object", synonyms: ["walls", "barrier", "rampart", "parapet", "battlement"],         generatorFamily: "architecture", variant: "wall" },
  { canonical: "building",   type: "object", synonyms: ["buildings", "structure", "structures", "edifice"],              generatorFamily: "urban", variant: "building" },
  { canonical: "pillar",     type: "object", synonyms: ["pillars", "column", "columns", "pedestal"],                    generatorHint: "pillar", generatorFamily: "architecture", variant: "pillar" },
  { canonical: "arch",       type: "object", synonyms: ["arches", "archway", "arcade"],                                 generatorFamily: "architecture", variant: "arch" },
  { canonical: "dome",       type: "object", synonyms: ["domes", "cupola", "rotunda"],                                  generatorFamily: "architecture", variant: "dome" },
  { canonical: "pyramid",    type: "object", synonyms: ["pyramids", "ziggurat", "ziggurats"],                            generatorFamily: "architecture", variant: "pyramid" },
  { canonical: "steeple",    type: "object", synonyms: ["steeples", "belfry", "campanile"],                             generatorFamily: "architecture", variant: "steeple" },
  { canonical: "lighthouse", type: "object", synonyms: ["watchtower", "signal tower"],                                  generatorFamily: "coastal", variant: "lighthouse" },
  { canonical: "windmill",   type: "object", synonyms: ["windmills", "mill", "watermill"],                              generatorFamily: "urban", variant: "windmill" },
  { canonical: "fountain",   type: "object", synonyms: ["fountains", "wellspring"],                                     generatorFamily: "architecture", variant: "fountain" },
  { canonical: "stairs",     type: "object", synonyms: ["staircase", "stairway", "steps", "ladder"],                    generatorFamily: "architecture", variant: "stairs" },
  { canonical: "platform",   type: "object", synonyms: ["platforms", "dais", "stage", "podium"],                        generatorFamily: "architecture", variant: "platform" },
  { canonical: "monument",   type: "object", synonyms: ["memorial", "tombstone", "gravestone", "headstone", "cenotaph"], generatorFamily: "architecture", variant: "monument" },
  { canonical: "statue",     type: "object", synonyms: ["statues", "sculpture", "idol", "effigy", "figure", "figurine"], generatorHint: "statue", generatorFamily: "architecture", variant: "statue" },

  // ─── Natural Objects ──────────────────────────────────────────────
  { canonical: "tree",       type: "object", synonyms: ["trees", "oak", "pine", "willow", "redwood", "sapling", "birch", "cedar", "cypress"], generatorHint: "tree", generatorFamily: "forest", variant: "tree" },
  { canonical: "stone",      type: "object", synonyms: ["stones", "boulder", "boulders", "pebble", "pebbles", "slab", "slabs"], generatorHint: "stone", generatorFamily: "mountains", variant: "stone" },
  { canonical: "rock",       type: "object", synonyms: ["rocks"],                                                       generatorHint: "rock", generatorFamily: "mountains", variant: "rock" },
  { canonical: "crystal",    type: "object", synonyms: ["crystals", "gem", "gems", "gemstone", "jewel", "prism", "shard", "shards"], generatorHint: "crystal", generatorFamily: "cave", variant: "crystal" },
  { canonical: "vine",       type: "object", synonyms: ["vines", "ivy", "creeper", "tendril", "tendrils"],              generatorFamily: "forest", variant: "vine" },
  { canonical: "root",       type: "object", synonyms: ["roots", "rootwork"],                                           generatorFamily: "forest", variant: "root" },
  { canonical: "mushroom",   type: "object", synonyms: ["mushrooms", "fungus", "fungi", "toadstool", "toadstools"],     generatorFamily: "forest", variant: "mushroom" },
  { canonical: "flower",     type: "object", synonyms: ["flowers", "blossom", "bloom", "petal", "petals", "rose", "lily"], generatorFamily: "organic", variant: "flower" },

  // ─── Ruins / Fragments ────────────────────────────────────────────
  { canonical: "ruins",      type: "object", synonyms: ["ruin", "wreckage", "rubble", "debris", "remnants", "remains"], generatorHint: "ruins", generatorFamily: "ruins", variant: "ruins" },
  { canonical: "fragments",  type: "object", synonyms: ["fragment", "pieces", "splinters", "chips"],                    generatorHint: "fragments", generatorFamily: "ruins", variant: "fragments" },
  { canonical: "skull",      type: "object", synonyms: ["skulls", "skeleton", "skeletons"],                             generatorFamily: "ruins", variant: "skull" },
  { canonical: "bone",       type: "object", synonyms: ["bones", "ribcage", "jawbone"],                                 generatorFamily: "ruins", variant: "bone" },
  { canonical: "cage",       type: "object", synonyms: ["cages", "enclosure", "pen"],                                   generatorFamily: "ruins", variant: "cage" },
  { canonical: "chain",      type: "object", synonyms: ["chains", "shackle", "shackles", "fetter"],                     generatorFamily: "ruins", variant: "chain" },

  // ─── Artifacts / Items ────────────────────────────────────────────
  { canonical: "throne",     type: "object", synonyms: ["seat"],                                                        related: ["castle", "palace"] },
  { canonical: "altar",      type: "object", synonyms: [],                                                              related: ["temple", "sacred"] },
  { canonical: "sword",      type: "object", synonyms: ["blade", "dagger", "weapon", "claymore", "katana"],             related: ["ancient"] },
  { canonical: "crown",      type: "object", synonyms: ["crowns", "tiara", "diadem", "circlet"],                        related: ["palace", "castle"] },
  { canonical: "mirror",     type: "object", synonyms: ["mirrors", "looking glass"],                                    generatorFamily: "surreal_abstract", variant: "mirror" },
  { canonical: "mask",       type: "object", synonyms: ["masks", "visage"],                                             generatorFamily: "surreal_abstract", variant: "mask" },
  { canonical: "bell",       type: "object", synonyms: ["bells", "chime", "gong"],                                      generatorFamily: "architecture", variant: "bell" },
  { canonical: "key",        type: "object", synonyms: ["keys"],                                                        related: ["gate", "door"] },
  { canonical: "flag",       type: "object", synonyms: ["flags", "banner", "banners", "pennant", "standard"],           related: ["castle"] },
  { canonical: "book",       type: "object", synonyms: ["books", "tome", "tomes", "grimoire", "manuscript", "scroll", "scrolls"], generatorFamily: "architecture", variant: "book" },
  { canonical: "orb",        type: "object", synonyms: ["sphere", "globe", "ball"],                                     generatorFamily: "celestial", variant: "orb" },
  { canonical: "lantern",    type: "object", synonyms: ["lamp", "torch", "candle", "beacon"],                           generatorFamily: "organic", variant: "lantern" },
  { canonical: "campfire",   type: "object", synonyms: ["fire", "bonfire", "pyre", "hearth", "flame", "flames"],        generatorFamily: "organic", variant: "fire" },
  { canonical: "ring",       type: "object", synonyms: ["rings", "band", "hoop"],                                       generatorFamily: "surreal_abstract", variant: "ring" },
  { canonical: "door",       type: "object", synonyms: ["trapdoor", "hatch"],                                           related: ["house"] },
  { canonical: "window",     type: "object", synonyms: ["windows", "pane", "stained glass"],                            related: ["building"] },
  { canonical: "clock",      type: "object", synonyms: ["clocks", "timepiece", "sundial", "hourglass"],                 related: ["mechanical"] },
  { canonical: "ship",       type: "object", synonyms: ["boat", "vessel", "galleon", "raft", "ark", "barge"],           generatorFamily: "coastal", variant: "ship" },
  { canonical: "anchor",     type: "object", synonyms: ["anchors"],                                                     generatorFamily: "coastal", variant: "anchor" },

  // ═══════════════════════════════════════════════════════════════════
  //  DESCRIPTORS  (~63 entries)
  // ═══════════════════════════════════════════════════════════════════

  // ─── Visual / Color ───────────────────────────────────────────────
  { canonical: "bright",     type: "descriptor", synonyms: ["glowing", "luminous", "radiant", "shining", "brilliant", "gleaming", "incandescent", "lit"], related: ["glass"] },
  { canonical: "dark",       type: "descriptor", synonyms: ["shadowy", "dim", "gloomy", "murky", "pitch", "obsidian", "ebon"], related: ["night"] },
  { canonical: "golden",     type: "descriptor", synonyms: ["gold", "gilded", "amber", "aureate"] },
  { canonical: "silver",     type: "descriptor", synonyms: ["platinum", "chrome", "metallic", "steel", "iron"] },
  { canonical: "neon",       type: "descriptor", synonyms: ["fluorescent", "electric", "vivid", "cyberpunk"], related: ["city", "bright"] },
  { canonical: "purple",     type: "descriptor", synonyms: ["violet", "indigo", "lavender", "magenta", "amethyst"] },
  { canonical: "crimson",    type: "descriptor", synonyms: ["red", "scarlet", "vermilion", "ruby", "blood"] },
  { canonical: "emerald",    type: "descriptor", synonyms: ["green", "verdant", "viridian", "chartreuse", "jade"] },
  { canonical: "azure",      type: "descriptor", synonyms: ["blue", "cerulean", "sapphire", "cobalt", "teal"] },
  { canonical: "ivory",      type: "descriptor", synonyms: ["white", "pale", "alabaster", "cream", "bone-white"] },
  { canonical: "copper",     type: "descriptor", synonyms: ["bronze", "brass", "tarnished", "patina", "oxidized"] },
  { canonical: "shimmering", type: "descriptor", synonyms: ["glistening", "sparkling", "twinkling", "iridescent"] },

  // ─── Physical / State ─────────────────────────────────────────────
  { canonical: "ancient",    type: "descriptor", synonyms: ["old", "timeless", "primordial", "prehistoric", "archaic", "antique", "weathered"], related: ["ruins"] },
  { canonical: "floating",   type: "descriptor", synonyms: ["hovering", "levitating", "airborne", "drifting", "suspended", "weightless"] },
  { canonical: "giant",      type: "descriptor", synonyms: ["huge", "enormous", "colossal", "immense", "towering", "titanic", "gargantuan"] },
  { canonical: "tiny",       type: "descriptor", synonyms: ["small", "miniature", "diminutive", "petite", "little", "microscopic"] },
  { canonical: "massive",    type: "descriptor", synonyms: ["monumental", "imposing", "grand", "majestic", "grandiose"] },
  { canonical: "endless",    type: "descriptor", synonyms: ["infinite", "boundless", "eternal", "limitless", "vast", "sprawling", "unending"] },
  { canonical: "ruined",     type: "descriptor", synonyms: ["crumbling", "decayed", "dilapidated", "desolate", "demolished", "destroyed"], related: ["ruins"] },
  { canonical: "frozen",     type: "descriptor", synonyms: ["icy", "glacial", "frigid", "arctic", "wintry", "frost", "frosty"] },
  { canonical: "burning",    type: "descriptor", synonyms: ["fiery", "blazing", "flaming", "infernal", "molten", "volcanic", "lava"] },
  { canonical: "shattered",  type: "descriptor", synonyms: ["fractured", "splintered", "cracked", "broken"] },
  { canonical: "twisted",    type: "descriptor", synonyms: ["warped", "contorted", "gnarled", "bent", "spiraling", "crooked"] },
  { canonical: "hollow",     type: "descriptor", synonyms: ["empty", "cavernous", "void-like"] },
  { canonical: "submerged",  type: "descriptor", synonyms: ["underwater", "sunken", "drowned", "subaquatic"] },
  { canonical: "overgrown",  type: "descriptor", synonyms: ["mossy", "tangled", "vine-covered", "wild", "untamed"] },
  { canonical: "petrified",  type: "descriptor", synonyms: ["fossilized", "calcified", "stonelike"] },
  { canonical: "dusty",      type: "descriptor", synonyms: ["arid", "parched", "dry", "withered"] },
  { canonical: "rusty",      type: "descriptor", synonyms: ["corroded", "rusted", "oxidized"] },

  // ─── Material ─────────────────────────────────────────────────────
  { canonical: "glass",      type: "descriptor", synonyms: ["transparent", "translucent", "crystalline", "prismatic", "vitreous"], related: ["crystal"] },
  { canonical: "wooden",     type: "descriptor", synonyms: ["timber", "carved", "hewn", "oaken"] },
  { canonical: "marble",     type: "descriptor", synonyms: ["granite", "polished", "veined", "chiseled"] },
  { canonical: "organic",    type: "descriptor", synonyms: ["biological", "living", "fleshy", "growing"] },
  { canonical: "mechanical", type: "descriptor", synonyms: ["clockwork", "industrial", "automated", "gear", "steampunk"] },
  { canonical: "ornate",     type: "descriptor", synonyms: ["decorated", "adorned", "embellished", "filigree", "baroque"] },

  // ─── Mood / Atmosphere ────────────────────────────────────────────
  { canonical: "quiet",      type: "descriptor", synonyms: ["silent", "peaceful", "serene", "calm", "tranquil", "hushed", "still"] },
  { canonical: "magical",    type: "descriptor", synonyms: ["enchanted", "mystical", "arcane", "sorcerous", "spellbound", "bewitched"] },
  { canonical: "ethereal",   type: "descriptor", synonyms: ["ghostly", "spectral", "phantom", "wraithlike", "otherworldly", "transcendent"] },
  { canonical: "hidden",     type: "descriptor", synonyms: ["secret", "concealed", "obscured", "veiled", "cloaked", "shrouded"] },
  { canonical: "sacred",     type: "descriptor", synonyms: ["holy", "divine", "blessed", "consecrated", "hallowed"] },
  { canonical: "misty",      type: "descriptor", synonyms: ["foggy", "hazy", "smoky", "clouded", "nebulous"] },
  { canonical: "futuristic", type: "descriptor", synonyms: ["scifi", "advanced", "technological", "cyber", "digital"] },
  { canonical: "cursed",     type: "descriptor", synonyms: ["hexed", "damned", "blighted", "tainted", "accursed"] },
  { canonical: "forgotten",  type: "descriptor", synonyms: ["abandoned", "forsaken", "derelict", "neglected", "deserted"] },
  { canonical: "haunted",    type: "descriptor", synonyms: ["possessed", "eerie", "sinister", "ominous"] },
  { canonical: "whispering", type: "descriptor", synonyms: ["murmuring", "humming", "singing", "resonating"] },
  { canonical: "pulsing",    type: "descriptor", synonyms: ["throbbing", "vibrating", "rhythmic", "beating"] },

  // ─── Surreal Modifiers ────────────────────────────────────────────
  { canonical: "surreal",    type: "descriptor", synonyms: ["dreamlike", "bizarre", "psychedelic", "fantastical", "hallucinatory", "trippy", "astral", "cosmic"] },
  { canonical: "inverted",   type: "descriptor", synonyms: ["reversed", "flipped", "upside-down"] },
  { canonical: "mirrored",   type: "descriptor", synonyms: ["reflective", "reflected", "duplicated"] },
  { canonical: "kaleidoscopic", type: "descriptor", synonyms: ["prismatic", "fractal", "recursive", "tessellated"] },
  { canonical: "melting",    type: "descriptor", synonyms: ["dissolving", "liquefying", "dripping", "oozing"] },

  // ═══════════════════════════════════════════════════════════════════
  //  WEATHER / CELESTIAL  (mapped as descriptors for parser)  (~15)
  // ═══════════════════════════════════════════════════════════════════
  { canonical: "rain",       type: "descriptor", synonyms: ["rainy", "raining", "downpour", "drizzle", "shower", "monsoon"] },
  { canonical: "storm",      type: "descriptor", synonyms: ["stormy", "tempest", "hurricane", "cyclone", "thunderstorm"] },
  { canonical: "thunder",    type: "descriptor", synonyms: ["lightning", "thundering", "thunderous"] },
  { canonical: "snow",       type: "descriptor", synonyms: ["snowy", "snowing", "blizzard", "sleet", "hail", "flurry"] },
  { canonical: "wind",       type: "descriptor", synonyms: ["windy", "gale", "breeze", "gusty", "blustery"] },
  { canonical: "fog",        type: "descriptor", synonyms: ["mist", "fogbound"] },
  { canonical: "night",      type: "descriptor", synonyms: ["midnight", "nocturnal", "nighttime", "nightfall"] },
  { canonical: "moon",       type: "descriptor", synonyms: ["moonlit", "moonlight", "lunar", "crescent"] },
  { canonical: "stars",      type: "descriptor", synonyms: ["starry", "starlight", "starlit", "constellation", "constellations"] },
  { canonical: "sun",        type: "descriptor", synonyms: ["sunny", "sunlit", "sunlight", "solar", "daylight"] },
  { canonical: "sunset",     type: "descriptor", synonyms: ["dusk", "twilight", "dawn", "sunrise", "daybreak"] },
  { canonical: "aurora",     type: "descriptor", synonyms: ["northern lights", "borealis", "australis"] },
  { canonical: "eclipse",    type: "descriptor", synonyms: ["solar eclipse", "lunar eclipse", "umbra"] },
  { canonical: "comet",      type: "descriptor", synonyms: ["meteor", "shooting star", "meteorite", "falling star"] },
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

/**
 * Retrieve the generator family and variant for a canonical concept.
 * Returns undefined if the concept has no family assignment.
 */
export function getGeneratorFamily(canonical: string): { family: GeneratorFamily; variant: string } | undefined {
  const entry = canonicalIndex.get(canonical);
  if (entry?.generatorFamily) {
    return { family: entry.generatorFamily, variant: entry.variant ?? canonical };
  }
  return undefined;
}

/**
 * Return all canonical names for concepts within a given generator family.
 */
export function getConceptsByFamily(family: GeneratorFamily): string[] {
  return CONCEPTS
    .filter((e) => e.generatorFamily === family)
    .map((e) => e.canonical);
}
