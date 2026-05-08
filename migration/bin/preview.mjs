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
  },
});

const stagedRoot = path.resolve(values.staged);
const contentTarget = path.resolve(values.content);
const uploadsTarget = path.resolve(values.uploads);

console.log(`Comparing staged → live volumes`);
console.log(`  staged content:  ${stagedRoot}/content`);
console.log(`  live content:    ${contentTarget}`);
console.log(`  staged uploads:  ${stagedRoot}/uploads`);
console.log(`  live uploads:    ${uploadsTarget}`);
console.log("");

const summary = {
  contentNew: 0,
  contentCollision: 0,
  uploadsNew: 0,
  uploadsCollision: 0,
};
const collisionsContent = [];
const collisionsUploads = [];

await diffTree(path.join(stagedRoot, "content"), contentTarget, {
  onNew: () => summary.contentNew++,
  onCollision: (rel) => {
    summary.contentCollision++;
    if (collisionsContent.length < 20) collisionsContent.push(rel);
  },
});

await diffTree(path.join(stagedRoot, "uploads"), uploadsTarget, {
  onNew: () => summary.uploadsNew++,
  onCollision: (rel) => {
    summary.uploadsCollision++;
    if (collisionsUploads.length < 20) collisionsUploads.push(rel);
  },
});

console.log("=".repeat(60));
console.log("Preview");
console.log("=".repeat(60));
console.log(`  Content:  ${summary.contentNew} new, ${summary.contentCollision} would collide`);
console.log(`  Uploads:  ${summary.uploadsNew} new, ${summary.uploadsCollision} would collide`);

if (collisionsContent.length) {
  console.log("\nContent collisions (first 20):");
  for (const c of collisionsContent) console.log(`  ! ${c}`);
}
if (collisionsUploads.length) {
  console.log("\nUploads collisions (first 20):");
  for (const c of collisionsUploads) console.log(`  ! ${c}`);
}

if (summary.contentCollision > 0 || summary.uploadsCollision > 0) {
  console.log(
    "\nApply will REFUSE if there are collisions. To override, run\n" +
      "  make migrate-apply FORCE=1\n" +
      "which overwrites colliding files with the staged versions.",
  );
}

async function diffTree(stagedDir, targetDir, { onNew, onCollision }) {
  let stagedFiles;
  try {
    stagedFiles = await globby("**/*", { cwd: stagedDir, dot: false, onlyFiles: true });
  } catch {
    return;
  }
  for (const rel of stagedFiles) {
    const targetPath = path.join(targetDir, rel);
    try {
      await fs.access(targetPath);
      onCollision(rel);
    } catch {
      onNew();
    }
  }
}
