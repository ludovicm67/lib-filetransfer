// Post-process the generated TypeDoc HTML so the Mermaid diagram renders reliably
// in production (behind a CDN / Cloudflare).
//
// typedoc-plugin-mermaid injects `mermaid.initialize({startOnLoad:true})`, which
// only hooks the window "load" event. But mermaid is imported asynchronously from a
// CDN, so on a cold/slow connection that import resolves AFTER "load" has already
// fired — the auto-render never triggers and the diagram stays blank. (Locally the
// import is instant/cached, so it wins the race; in production it loses.)
//
// We switch to an explicit `mermaid.run()` call, which renders regardless of timing,
// and add `data-cfasync="false"` so Cloudflare Rocket Loader leaves the ES module
// script alone instead of rewriting its `type="module"`.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "api");
const NEEDLE = "mermaid.initialize({startOnLoad:true});";
const REPLACEMENT = "mermaid.initialize({startOnLoad:false});mermaid.run();";

let patched = 0;
const entries = await readdir(apiDir, { recursive: true });
for (const rel of entries) {
  if (!rel.endsWith(".html")) continue;
  const file = join(apiDir, rel);
  const html = await readFile(file, "utf8");
  if (!html.includes(NEEDLE)) continue;
  const fixed = html
    .replace(NEEDLE, REPLACEMENT)
    .replace('<script type="module">', '<script type="module" data-cfasync="false">');
  await writeFile(file, fixed);
  patched++;
}

console.log(`✓ Mermaid render fix applied to ${patched} page(s)`);
