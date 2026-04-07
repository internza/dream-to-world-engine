import { transformDreamToWorld } from "./dist/core/transform.js";

const tests = [
  // Original tests
  "A metropolis above the mist with crystal skyscrapers",
  "I was in a quiet ancient forest with glowing ruins and floating stone fragments",
  "An endless neon city with bridges and towers in the rain",
  "xyzzy bloop flurb",
  // 14B Validation dreams
  "A massive glowing floating city above endless clouds and ocean during a storm",
  "A quiet ancient forest with glowing ruins and floating stone fragments",
  "A giant castle above the ocean under a purple sky",
  // 14C Validation dreams (Landmarks, World Identity, Navigability)
  "A magical cave above an ornate temple with enchanted spires at midnight",
  "dusty fragments and ethereal tower in an endless beach beside a silver forest",
  "A pulsing petrified arena with twisted bells beside lava streams",
  // 14D Validation dreams (Particles, Atmosphere, Dream Effects)
  "magical cave",
  "lava arena",
  "forest",
  "night sky",
  // 14E+F Validation dreams (Spatial Audio + Cinematic Intro)
  "ocean sunset",
  "dark cave",
  "forest",
  // 15H Validation dreams (Dream Intelligence, Grounded Spawn, Weather)
  "A frozen temple inside a volcanic cave with golden altars and lava streams at midnight",
  "A petrified arena above an enchanted forest with crystalline pillars during a storm",
  "An endless ocean realm with mirrored towers and coral growths under aurora lights",
  // 16L Validation dreams (Compact World, Living Presence, Terrain, Micro-Generators)
  "A crumbling temple with wandering pilgrims and a glowing fountain in a misty forest",
  "A vast arena surrounded by lava streams with shadowy creatures and a bell tower",
  "A hidden shrine near a campfire with animals and stone altars in a cave",
  "An ancient spire above a frozen lake with guardians and swirling snow",
  // 19M Validation dreams (Interior Detection, Crowd/Density, Scene Intelligence)
  "inside a school hallway with flickering lights and dusty books",
  "lots of people in a crowded city with neon signs at night",
  "an empty desert with a single broken tower under the stars",
  "A dark abandoned hospital corridor with broken windows",
  "A bustling bazaar in a golden temple at sunset",
  "A quiet room with a mirror and floating candles",
];

// Expected archetypes for 14B validation:
// Test 5: floating_city (floating + city + above + clouds)
// Test 6: forest_ruins (forest + ruins)
// Test 7: castle_sky  (castle + above + ocean)

// Expected 14C landmarks:
// Test 8: temple = primary (PRIMARY_LANDMARK_NOUNS + "ornate" emphasis), cave = secondary (above relationship +3), spires = background
// Test 9: tower = primary (PRIMARY_LANDMARK_NOUNS), beach/forest = background (BACKGROUND_NOUNS), fragments = background
// Test 10: arena = primary (PRIMARY_LANDMARK_NOUNS), bells = secondary or background, lava streams = background

// Expected 14D particle themes (detected from semantics):
// Test 11: "magical cave" → mood=mystical/dreamlike + environment=cave → magic particles + cave dust
// Test 12: "lava arena"  → danger=dangerous → lava sparks
// Test 13: "forest"      → environment=forest → leaf particles
// Test 14: "night sky"   → time=night → star twinkle (handled by starfield)

// Expected 14E+F ambient audio (from resolveAmbientProfile):
// Test 15: "ocean sunset" → ocean ambient (waves), sunset sky
// Test 16: "dark cave"    → cave ambient (echo + drip)
// Test 17: "forest"       → forest ambient (birds + wind)

// Expected 15H validation:
// Test 18: "frozen temple inside volcanic cave..." → environment=cave, mood=mystical/dark,
//          temple=primary_landmark, cave=secondary, palette=warm (lava+golden), tone=wonder,
//          archetype likely dream_zone or forest_ruins (cave+temple)
// Test 19: "petrified arena above enchanted forest..." → arena=primary_landmark,
//          forest=background, layout=layered (above), palette=cool (crystalline),
//          archetype=forest_ruins (forest+ruins/temple-like)
// Test 20: "endless ocean realm with mirrored towers..." → archetype=ocean_realm,
//          realm=primary_landmark or tower, palette=cool (aurora), tone=wonder/awe

// Expected 16L validation:
// Test 21: "crumbling temple with wandering pilgrims..." → temple=primary_landmark (16K),
//          pilgrims → living presence (16C humanoid), fountain → 16K micro-gen,
//          forest=background → terrain noise + grass sway (16E/F), archetype=forest_ruins
// Test 22: "vast arena surrounded by lava..." → arena=primary_landmark (16K),
//          creatures → living presence (16C creature), bell → 16K micro-gen,
//          lava → 16K micro-gen, compact placement (16A)
// Test 23: "hidden shrine near campfire with animals..." → shrine=16K micro-gen,
//          campfire=16K, animals → living presence (16C animal),
//          altar=16K, cave=secondary, archetype=dream_zone or cave-like
// Test 24: "ancient spire above frozen lake..." → spire=16K micro-gen,
//          guardians → living presence (16C humanoid), weather=snow (15),
//          layout=layered (above), archetype likely castle_sky or dream_zone

// Expected 19M validation:
// Test 25: "inside a school hallway..." → sceneType=interior (detectInteriorHint),
//          hallway detected via multi-word collapse ("school hallway"), density=balanced
// Test 26: "lots of people in a crowded city..." → density=dense (crowd hint from
//          "lots of" + "crowded"), sceneType=city, time=night
// Test 27: "an empty desert..." → density=sparse (EMPTY_WORDS "empty"),
//          sceneType=desert, time=night (stars)
// Test 28: "dark abandoned hospital corridor..." → sceneType=interior
//          (detectInteriorHint from "hospital"/"corridor"), mood=dark
// Test 29: "bustling bazaar in golden temple..." → density=dense (crowd hint
//          "bustling"), sceneType=temple, time=sunset
// Test 30: "quiet room with mirror and floating candles..." → sceneType=interior
//          (detectInteriorHint from "room"), mood=calm/mystical

// Simple ambient category resolver (mirrors audio.ts resolveAmbientProfile for testing)
function testAmbientCategory(names) {
  if (["ocean","sea","beach","lake","harbor","reef"].some(w => names.has(w))) return "ocean";
  if (["forest","jungle","garden","marsh"].some(w => names.has(w))) return "forest";
  if (["city","street","village","bazaar"].some(w => names.has(w))) return "city";
  if (["cave","crypt","dungeon","underground"].some(w => names.has(w))) return "cave";
  if (["desert","oasis"].some(w => names.has(w))) return "desert";
  if (["glacier","tundra","frozen","snow","snowy"].some(w => names.has(w))) return "frozen";
  if (["rain","rainy","storm","thunder"].some(w => names.has(w))) return "rain";
  return "night";
}

for (let i = 0; i < tests.length; i++) {
  const d = tests[i];
  const w = transformDreamToWorld(d);
  const names = new Set(w.entities.map(e => e.attributes.name));
  console.log("--- Test " + (i + 1) + ": " + d);
  console.log("Archetype: " + w.archetype);
  console.log("Scene Type: " + (w.sceneType ?? "n/a"));
  console.log("Primary Landmark ID: " + (w.primaryLandmarkId ?? "none"));
  console.log("Ambient Audio: " + testAmbientCategory(names));
  // 15C: Dream profile output
  if (w.dreamProfile) {
    const dp = w.dreamProfile;
    console.log("Dream Profile: palette=" + dp.palette + " tone=" + dp.tone +
      " layout=" + dp.layout + " coherence=" + dp.coherence.toFixed(2) +
      " keywords=[" + dp.keywords.join(", ") + "]");
  }
  console.log("Entities:");
  for (const e of w.entities) {
    const role = e.landmarkRole !== "none" ? " [ROLE: " + e.landmarkRole + "]" : "";
    console.log("  " + e.id + " [" + e.type + "] " + e.attributes.name + role);
  }
  console.log("Relations:");
  for (const r of w.relationships) {
    console.log("  " + r.id + " " + r.type + " " + r.from + " -> " + r.to);
  }
  console.log("Semantics:", JSON.stringify(w.semantics));
  console.log();
}
