import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const srcDir = join(rootDir, "src");
const distDir = join(rootDir, "dist");
const port = 5173;

const tsc = spawn("npx", ["tsc", "--watch", "--preserveWatchOutput"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: true
});

tsc.on("exit", (code) => {
  console.log(`tsc exited with code ${code}`);
});

const server = createServer(async (req, res) => {
  const url = req.url || "/";

  if (url === "/" || url === "/index.html") {
    const htmlPath = join(srcDir, "web", "index.html");
    const html = await readFile(htmlPath, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  const safePath = normalize(join(distDir, url));
  if (!safePath.startsWith(distDir)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  try {
    const fileInfo = await stat(safePath);
    if (!fileInfo.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const contentType = extname(safePath) === ".js"
      ? "text/javascript; charset=utf-8"
      : "text/plain; charset=utf-8";

    const file = await readFile(safePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Build output not ready. Wait for tsc to finish.");
  }
});

server.listen(port, () => {
  console.log(`Web dev server running at http://localhost:${port}`);
});
