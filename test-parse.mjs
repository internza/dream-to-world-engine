import { transformDreamToWorld } from "./dist/core/transform.js";

const tests = [
  "A metropolis above the mist with crystal skyscrapers",
  "I was in a quiet ancient forest with glowing ruins and floating stone fragments",
  "An endless neon city with bridges and towers in the rain",
  "xyzzy bloop flurb"
];

for (let i = 0; i < tests.length; i++) {
  const d = tests[i];
  const w = transformDreamToWorld(d);
  console.log("--- Test " + (i + 1) + ": " + d);
  console.log("Entities:");
  for (const e of w.entities) {
    console.log("  " + e.id + " [" + e.type + "] " + e.attributes.name);
  }
  console.log("Relations:");
  for (const r of w.relationships) {
    console.log("  " + r.id + " " + r.type + " " + r.from + " -> " + r.to);
  }
  console.log();
}
