import { transformDreamToWorld } from "../core/transform.js";
import { disposeWorld, initRenderer, renderWorld } from "./renderer.js";

const input = document.querySelector<HTMLTextAreaElement>("#dream-input");
const button = document.querySelector<HTMLButtonElement>("#generate-btn");
const output = document.querySelector<HTMLPreElement>("#output");
const canvas = document.querySelector<HTMLCanvasElement>("#world-canvas");

if (!input || !button || !output || !canvas) {
  throw new Error("Missing required elements");
}

initRenderer(canvas);

button.addEventListener("click", () => {
  const text = input.value.trim();

  if (!text) {
    output.textContent = "Enter a dream to see output.";
    disposeWorld();
    return;
  }

  const world = transformDreamToWorld(text);
  output.textContent = JSON.stringify(world, null, 2);
  renderWorld(world);
});
