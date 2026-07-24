// Generate sitemap.xml + robots.txt for the whole site (landing page + API docs).
// Runs last, once docs/ holds every generated page.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs");

// Base URL comes from the custom domain (CNAME), so it stays in one place.
const cname = (await readFile(join(root, "site", "CNAME"), "utf8")).trim();
const base = `https://${cname}`;

// Every generated .html page becomes a URL, except the 404 page.
const entries = await readdir(docsDir, { recursive: true });
const paths = [];
for (const entry of entries) {
  const rel = entry.split(sep).join("/");
  if (!rel.endsWith(".html")) continue;
  if (rel === "404.html") continue;
  // Pretty URLs: "index.html" -> "", "api/index.html" -> "api/".
  paths.push(rel.replace(/(^|\/)index\.html$/, "$1"));
}
paths.sort();

const lastmod = new Date().toISOString().slice(0, 10);
const body = paths
  .map((p) => `  <url>\n    <loc>${base}/${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
  .join("\n");
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  `${body}\n</urlset>\n`;
await writeFile(join(docsDir, "sitemap.xml"), sitemap);

const robots = `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;
await writeFile(join(docsDir, "robots.txt"), robots);

console.log(`✓ sitemap.xml (${paths.length} URLs) + robots.txt written`);
