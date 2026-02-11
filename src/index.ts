import { transformDreamToWorld } from "./core/transform.js";

const dreamText = "A floating city above the clouds with glass towers";
const world = transformDreamToWorld(dreamText);
console.log(JSON.stringify(world, null, 2));
