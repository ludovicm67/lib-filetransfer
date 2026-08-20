// Generate sitemap.xml + robots.txt for the whole site (landing page + API docs).
// Runs last, once docs/ holds every generated page.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

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

/**
 * Date of the last commit touching a path, as YYYY-MM-DD.
 *
 * Stamping every page with the date of the build would mark the whole site as
 * changed on every push, and a `lastmod` that is obviously unreliable is one
 * a search engine ignores. Returns undefined when the history is not there --
 * a shallow clone, or no git at all -- so the field is left out rather than
 * being made up.
 *
 * @param {string} path Path to look up, relative to the repository.
 * @returns {string | undefined}
 */
const lastCommitDate = (path) => {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%cs", "--", path],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();

    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : undefined;
  } catch {
    return undefined;
  }
};

// The landing page comes from site/, every API page from the sources.
const siteDate = lastCommitDate("site");
const apiDate = lastCommitDate("src");

const body = paths
  .map((p) => {
    const lastmod = p.startsWith("api/") ? apiDate : siteDate;
    const stamp = lastmod === undefined ? "" : `\n    <lastmod>${lastmod}</lastmod>`;

    return `  <url>\n    <loc>${base}/${p}</loc>${stamp}\n  </url>`;
  })
  .join("\n");
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  `${body}\n</urlset>\n`;
await writeFile(join(docsDir, "sitemap.xml"), sitemap);

const robots = `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;
await writeFile(join(docsDir, "robots.txt"), robots);

console.log(`✓ sitemap.xml (${paths.length} URLs) + robots.txt written`);
