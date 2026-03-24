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
];

// Expected archetypes for 14B validation:
// Test 5: floating_city (floating + city + above + clouds)
// Test 6: forest_ruins (forest + ruins)
// Test 7: castle_sky  (castle + above + ocean)

for (let i = 0; i < tests.length; i++) {
  const d = tests[i];
  const w = transformDreamToWorld(d);
  console.log("--- Test " + (i + 1) + ": " + d);
  console.log("Archetype: " + w.archetype);
  console.log("Entities:");
  for (const e of w.entities) {
    console.log("  " + e.id + " [" + e.type + "] " + e.attributes.name);
  }
  console.log("Relations:");
  for (const r of w.relationships) {
    console.log("  " + r.id + " " + r.type + " " + r.from + " -> " + r.to);
  }
  console.log("Semantics:", JSON.stringify(w.semantics));
  console.log();
}
