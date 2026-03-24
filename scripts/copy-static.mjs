import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcWebDir = join(rootDir, "src", "web");
const distDir = join(rootDir, "dist");
const distWebDir = join(distDir, "web");

async function copyIfExists(src, dest, recursive = false) {
  try {
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest, { recursive, force: true });
  } catch {
    // Optional assets may not exist; ignore.
  }
}

await mkdir(distWebDir, { recursive: true });
await copyIfExists(join(srcWebDir, "index.html"), join(distDir, "index.html"));
await copyIfExists(join(srcWebDir, "styles.css"), join(distWebDir, "styles.css"));
await copyIfExists(join(srcWebDir, "assets"), join(distWebDir, "assets"), true);
