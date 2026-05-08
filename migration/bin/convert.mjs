#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { writeMarkdown, targetPath } from "../lib/frontmatter.mjs";
import { stageMediaFile } from "../lib/media.mjs";
import { writeRedirectsFile } from "../lib/redirects.mjs";
import { loadOverrides } from "../lib/overrides.mjs";
import { detectSource } from "../lib/detect.mjs";

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    input: { type: "string", default: "/migration/input" },
    output: { type: "string", default: "/migration/staged" },
  },
  allowPositionals: false,
});

const inputDir = path.resolve(values.input);
const stagedRoot = path.resolve(values.output);

let source = values.from;
if (!source) {
  const detected = await detectSource(inputDir);
  source = detected.source;
  if (source === "unknown") {
    console.error(
      "Could not auto-detect source SSG. Specify it explicitly:\n" +
        "  make migrate-convert FROM=jekyll | FROM=hugo | FROM=microblog",
    );
    process.exit(1);
  }
  console.log(`Auto-detected source: ${source}`);
}

const adapterPath = `../adapters/${source}.mjs`;
let adapter;
try {
  adapter = await import(adapterPath);
} catch (err) {
  console.error(`Unknown adapter: ${source}`);
  console.error(`Available: jekyll, hugo, microblog`);
  process.exit(1);
}

const overrides = await loadOverrides(inputDir);
if (overrides.length) {
  console.log(`Loaded ${overrides.length} classification override(s) from _classify.yaml`);
}

console.log(`Running ${source} adapter on ${inputDir}...`);
const result = await adapter.convert({ inputDir, stagedRoot, overrides });

// Wipe and recreate staged content/ + uploads/ so converts are idempotent.
await fs.rm(path.join(stagedRoot, "content"), { recursive: true, force: true });
await fs.rm(path.join(stagedRoot, "uploads"), { recursive: true, force: true });
await fs.mkdir(path.join(stagedRoot, "content"), { recursive: true });
await fs.mkdir(path.join(stagedRoot, "uploads"), { recursive: true });

// Write posts
const byType = new Map();
for (const post of result.posts) {
  const rel = targetPath(post);
  const dest = path.join(stagedRoot, "content", rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, writeMarkdown(post), "utf8");
  byType.set(post.type, (byType.get(post.type) || 0) + 1);
}

// Stage media — preserves the original web path inside staged/uploads/
let mediaCount = 0;
for (const [src, webPath] of result.mediaSources) {
  await stageMediaFile(src, webPath, stagedRoot);
  mediaCount++;
}

// Redirects file
if (result.redirects && result.redirects.length) {
  await writeRedirectsFile(result.redirects, stagedRoot);
}

// Summary
console.log("");
console.log("=".repeat(60));
console.log(`Conversion complete (source: ${source})`);
console.log("=".repeat(60));
for (const [type, count] of [...byType.entries()].sort()) {
  console.log(`  ${type.padEnd(10)} ${count}`);
}
console.log(`  ${"media".padEnd(10)} ${mediaCount}`);
console.log(`  ${"redirects".padEnd(10)} ${result.redirects?.length || 0}`);
if (result.warnings && result.warnings.length) {
  console.log(`\nWarnings (${result.warnings.length}):`);
  const shown = result.warnings.slice(0, 20);
  for (const w of shown) console.log(`  - ${w}`);
  if (result.warnings.length > shown.length) {
    console.log(`  ...and ${result.warnings.length - shown.length} more`);
  }
}
console.log(`\nOutput: ${stagedRoot}`);
console.log(`Next:   make migrate-preview   # see what would land in your Indiekit volumes`);
console.log(`        make migrate-apply     # actually copy into the volumes`);
