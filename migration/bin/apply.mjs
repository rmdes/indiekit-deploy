#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { globby } from "globby";

const { values } = parseArgs({
  options: {
    staged: { type: "string", default: "/migration/staged" },
    content: { type: "string", default: "/data/content" },
    uploads: { type: "string", default: "/data/uploads" },
    caddy: { type: "string", default: "" },
    force: { type: "boolean", default: false },
  },
});

const stagedRoot = path.resolve(values.staged);
const contentTarget = path.resolve(values.content);
const uploadsTarget = path.resolve(values.uploads);
const caddyTarget = values.caddy ? path.resolve(values.caddy) : "";
const force = values.force || process.env.FORCE === "1";

const result = {
  contentCopied: 0,
  contentSkipped: 0,
  uploadsCopied: 0,
  uploadsSkipped: 0,
  redirectsCopied: false,
  collisions: [],
};

await applyTree({
  stagedDir: path.join(stagedRoot, "content"),
  targetDir: contentTarget,
  label: "content",
});
await applyTree({
  stagedDir: path.join(stagedRoot, "uploads"),
  targetDir: uploadsTarget,
  label: "uploads",
});

// Caddy redirects — copy the snippet into the Caddy mount so an
// `import migration-redirects` directive in the Caddyfile picks it up.
// Always overwrite (no collision check) — migration-redirects is a generated
// artifact, not user-edited content.
if (caddyTarget) {
  const stagedRedirects = path.join(stagedRoot, "Caddyfile.redirects");
  const targetRedirects = path.join(caddyTarget, "migration-redirects");
  try {
    await fs.access(stagedRedirects);
    await fs.mkdir(path.dirname(targetRedirects), { recursive: true });
    await fs.copyFile(stagedRedirects, targetRedirects);
    result.redirectsCopied = true;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    // No staged redirects file (no convert run yet, or no original URLs found).
  }
}

console.log("");
console.log("=".repeat(60));
console.log(`Apply ${force ? "(FORCE=1)" : "complete"}`);
console.log("=".repeat(60));
console.log(`  Content:    ${result.contentCopied} copied, ${result.contentSkipped} skipped`);
console.log(`  Uploads:    ${result.uploadsCopied} copied, ${result.uploadsSkipped} skipped`);
console.log(`  Redirects:  ${result.redirectsCopied ? "written → migration-redirects" : "skipped (no staged file)"}`);

if (result.collisions.length && !force) {
  console.error(
    `\nRefused to overwrite ${result.collisions.length} existing file(s).\n` +
      "Re-run with FORCE=1 to overwrite, or remove the conflicts manually:\n" +
      "  make migrate-apply FORCE=1",
  );
  for (const c of result.collisions.slice(0, 10)) console.error(`  ! ${c}`);
  if (result.collisions.length > 10) {
    console.error(`  ...and ${result.collisions.length - 10} more`);
  }
  process.exit(2);
}

if (result.contentCopied > 0) {
  console.log(
    "\nContent volume updated. The Eleventy watcher will rebuild incrementally;\n" +
      "for a full rebuild run:  make restart",
  );
}

if (result.redirectsCopied) {
  console.log(
    "\nRedirects written to docker/caddy/migration-redirects. To activate them,\n" +
      "ensure your Caddyfile contains `import migration-redirects` inside the\n" +
      "site block (added by default in this repo's Caddyfiles), then reload Caddy:\n" +
      "  docker compose restart caddy",
  );
}

async function applyTree({ stagedDir, targetDir, label }) {
  let files;
  try {
    files = await globby("**/*", { cwd: stagedDir, dot: false, onlyFiles: true });
  } catch {
    return;
  }
  for (const rel of files) {
    const src = path.join(stagedDir, rel);
    const dest = path.join(targetDir, rel);
    let exists = false;
    try {
      await fs.access(dest);
      exists = true;
    } catch {}
    if (exists && !force) {
      result.collisions.push(`${label}/${rel}`);
      result[`${label}Skipped`]++;
      continue;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    result[`${label}Copied`]++;
  }
}
