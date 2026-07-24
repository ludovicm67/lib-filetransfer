// Tiny zero-dependency static server for the built site in docs/.
// Serves the landing page at / and the API reference at /api/.
//
//   node scripts/serve-docs.mjs            -> http://localhost:8080
//   PORT=3000 node scripts/serve-docs.mjs  -> http://localhost:3000
//   NO_OPEN=1 node scripts/serve-docs.mjs  -> don't open the browser
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs");
const port = Number(process.env.PORT || process.argv[2] || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

if (!existsSync(join(docsDir, "index.html"))) {
  console.error(
    "\n  The site hasn't been built yet (docs/index.html is missing).\n" +
      "  Run `npm run docs` first, or use `npm run preview` to build and serve.\n"
  );
  process.exit(1);
}

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let filePath = normalize(join(docsDir, pathname));
    // stay inside docs/ (no path traversal)
    if (filePath !== docsDir && !filePath.startsWith(docsDir + sep)) {
      res.writeHead(403, { "content-type": "text/plain" });
      return res.end("Forbidden");
    }
    let info = null;
    try {
      info = await stat(filePath);
    } catch {}
    if (info?.isDirectory()) filePath = join(filePath, "index.html");
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>404 — Not Found</h1><p><a href=\"/\">Back to the landing page</a></p>");
  }
});

server.listen(port, () => {
  const url = `http://localhost:${port}/`;
  console.log("\n  lib-filetransfer site is running:\n");
  console.log(`  ▸ Landing page   ${url}`);
  console.log(`  ▸ API reference  ${url}api/\n`);
  console.log("  Press Ctrl+C to stop.\n");
  openBrowser(url);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${port} is already in use. Try: PORT=<other> npm run docs:serve\n`);
    process.exit(1);
  }
  throw err;
});

function openBrowser(url) {
  if (["1", "true"].includes(String(process.env.NO_OPEN))) return;
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(cmd, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* opening the browser is best-effort */
  }
}
