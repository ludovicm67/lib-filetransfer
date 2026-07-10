// Assemble the static site into docs/:
//   1. wipe docs/ (it is git-ignored, generated output)
//   2. copy the hand-written site/ into docs/
// The library bundle (docs/assets/lib-filetransfer.js) and the TypeDoc API
// reference (docs/api/) are produced by the sibling npm scripts.
import { rm, mkdir, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "site");
const docs = join(root, "docs");

await rm(docs, { recursive: true, force: true });
await mkdir(docs, { recursive: true });
await cp(site, docs, { recursive: true });

console.log("✓ Copied site/ → docs/");
