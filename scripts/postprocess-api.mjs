// Post-process the generated TypeDoc HTML:
//   1. inject the lib-filetransfer brand mark into the header title;
//   2. make the README Mermaid diagram render reliably in production;
//   3. add a <link rel="canonical"> so each page declares a single indexable URL;
//   4. give each page its own <title>, description and Open Graph tags.
//
// (2) Detail: typedoc-plugin-mermaid injects `mermaid.initialize({startOnLoad:true})`,
// which only hooks the window "load" event. But mermaid is imported asynchronously
// from a CDN, so behind a CDN/Cloudflare the import resolves AFTER "load" has fired
// and the diagram never renders. We switch to an explicit `mermaid.run()` and add
// `data-cfasync="false"` so Cloudflare Rocket Loader leaves the ES module alone.
//
// (4) Detail: TypeDoc puts the same description on every page, and gives the
// same title to the three index-like ones. Duplicated titles and descriptions
// are what makes a search engine drop them and write its own.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "docs", "api");

// Same base URL as the sitemap: the custom domain, kept in one place (site/CNAME).
const cname = (await readFile(join(root, "site", "CNAME"), "utf8")).trim();
const base = `https://${cname}`;

const PACKAGE = "@ludovicm67/lib-filetransfer";
const TAGLINE =
  "lib-filetransfer, the TypeScript library that moves large files in chunks over any transport.";

// The pages that are not a symbol, and what to call them.
const INDEX_PAGES = {
  "index.html": ["API reference", "Reference for every class, function and type of"],
  "modules.html": ["Exports", "Everything exported by"],
  "hierarchy.html": ["Class hierarchy", "How the classes relate to each other in"],
};

/**
 * Work out a title and a description for one generated page, from its path.
 *
 * @param {string} rel Path of the page, relative to the API directory.
 * @returns {{title: string, description: string}}
 */
const describe = (rel) => {
  const indexPage = INDEX_PAGES[rel];
  if (indexPage !== undefined) {
    const [name, lead] = indexPage;
    return {
      title: `${name} | ${PACKAGE}`,
      description: `${lead} ${TAGLINE}`,
    };
  }

  const symbol = rel.replace(/^.*\//, "").replace(/\.html$/, "");
  const kind = { classes: "class", functions: "function", types: "type" }[
    rel.split("/")[0]
  ];

  return {
    title: `${symbol} | ${PACKAGE}`,
    description: kind
      ? `The ${symbol} ${kind} of ${TAGLINE}`
      : `${symbol} in ${TAGLINE}`,
  };
};

/** Escape a string so it can sit inside a double-quoted HTML attribute. */
const attr = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

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
let canonicalPages = 0;
let metaPages = 0;
const entries = await readdir(apiDir, { recursive: true });
for (const entry of entries) {
  if (!entry.endsWith(".html")) continue;
  const rel = entry.split(sep).join("/");
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

  // 3. Canonical URL. Pretty URLs match the sitemap: "index.html" -> "".
  const url = `${base}/api/${rel.replace(/(^|\/)index\.html$/, "$1")}`;
  if (!html.includes('rel="canonical"')) {
    const withCanonical = html.replace(
      "<head>",
      `<head><link rel="canonical" href="${url}"/>`
    );
    if (withCanonical !== html) {
      html = withCanonical;
      canonicalPages++;
    }
  }

  // 4. A title and a description of its own, plus Open Graph tags.
  if (!html.includes('property="og:')) {
    const { title, description } = describe(rel);
    const before = html;

    html = html
      .replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`)
      .replace(
        /<meta name="description" content="[^"]*"\/>/,
        `<meta name="description" content="${attr(description)}"/>`
      )
      .replace(
        "</head>",
        `<meta property="og:type" content="article"/>` +
          `<meta property="og:site_name" content="lib-filetransfer"/>` +
          `<meta property="og:title" content="${attr(title)}"/>` +
          `<meta property="og:description" content="${attr(description)}"/>` +
          `<meta property="og:url" content="${url}"/>` +
          `<meta property="og:image" content="${base}/og.png"/>` +
          `<meta name="twitter:card" content="summary_large_image"/>` +
          `<meta name="twitter:image" content="${base}/og.png"/>` +
          "</head>"
      );

    if (html !== before) {
      metaPages++;
    }
  }

  if (html !== original) await writeFile(file, html);
}

console.log(
  `✓ Header brand added to ${brandPages} page(s); mermaid render fix on ${mermaidPages} page(s); ` +
    `canonical URL on ${canonicalPages} page(s); title, description and Open Graph on ${metaPages} page(s)`
);
