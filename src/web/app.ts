import { transformDreamToWorld } from "../core/transform.js";

const input = document.querySelector<HTMLTextAreaElement>("#dream-input");
const button = document.querySelector<HTMLButtonElement>("#generate-btn");
const output = document.querySelector<HTMLPreElement>("#output");

if (!input || !button || !output) {
  throw new Error("Missing required elements");
}

button.addEventListener("click", () => {
  const text = input.value.trim();

  if (!text) {
    output.textContent = "Enter a dream to see output.";
    return;
  }

  const world = transformDreamToWorld(text);
  output.textContent = JSON.stringify(world, null, 2);
});
