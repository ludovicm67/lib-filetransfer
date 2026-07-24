// Post-process the generated TypeDoc HTML:
//   1. inject the lib-filetransfer brand mark into the header title;
//   2. make the README Mermaid diagram render reliably in production.
//
// (2) Detail: typedoc-plugin-mermaid injects `mermaid.initialize({startOnLoad:true})`,
// which only hooks the window "load" event. But mermaid is imported asynchronously
// from a CDN, so behind a CDN/Cloudflare the import resolves AFTER "load" has fired
// and the diagram never renders. We switch to an explicit `mermaid.run()` and add
// `data-cfasync="false"` so Cloudflare Rocket Loader leaves the ES module alone.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "api");

const BRAND_MARK =
  '<svg class="lft-mark" viewBox="0 0 32 32" aria-hidden="true">' +
  '<defs><linearGradient id="lft-mark-grad" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#38bdf8"/><stop offset=".5" stop-color="#818cf8"/><stop offset="1" stop-color="#c084fc"/>' +
  "</linearGradient></defs>" +
  '<rect x="2" y="7" width="10" height="10" rx="2.5" fill="url(#lft-mark-grad)"/>' +
  '<rect x="20" y="15" width="10" height="10" rx="2.5" fill="url(#lft-mark-grad)" opacity=".55"/>' +
  '<path d="M12 12h6a3 3 0 0 1 3 3v3" fill="none" stroke="url(#lft-mark-grad)" stroke-width="2" stroke-linecap="round"/>' +
  "</svg>";

const MERMAID_NEEDLE = "mermaid.initialize({startOnLoad:true});";
const MERMAID_REPLACE = "mermaid.initialize({startOnLoad:false});mermaid.run();";

let brandPages = 0;
let mermaidPages = 0;
const entries = await readdir(apiDir, { recursive: true });
for (const rel of entries) {
  if (!rel.endsWith(".html")) continue;
  const file = join(apiDir, rel);
  const original = await readFile(file, "utf8");
  let html = original;

  // 1. Brand mark inside the header title link.
  if (!html.includes('class="lft-mark"')) {
    const withBrand = html.replace(/(<a\b[^>]*class="title">)/, `$1${BRAND_MARK}`);
    if (withBrand !== html) {
      html = withBrand;
      brandPages++;
    }
  }

  // 2. Reliable mermaid rendering + Rocket Loader shield (only diagram pages).
  if (html.includes(MERMAID_NEEDLE)) {
    html = html
      .replace(MERMAID_NEEDLE, MERMAID_REPLACE)
      .replace('<script type="module">', '<script type="module" data-cfasync="false">');
    mermaidPages++;
  }

  if (html !== original) await writeFile(file, html);
}

console.log(
  `✓ Header brand added to ${brandPages} page(s); mermaid render fix on ${mermaidPages} page(s)`
);
