#!/usr/bin/env node
import path from "node:path";
import { detectSource } from "../lib/detect.mjs";

const inputDir = path.resolve(process.argv[2] || "/migration/input");

const { source, evidence } = await detectSource(inputDir);

console.log(`Input directory: ${inputDir}`);
console.log(`Detected source: ${source}`);
if (evidence.length) {
  console.log("Evidence:");
  for (const e of evidence) console.log(`  - ${e}`);
}

if (source === "unknown") {
  console.error(
    "\nNo recognised SSG layout found. Supported layouts:\n" +
      "  jekyll   — _config.yml + _posts/\n" +
      "  hugo     — hugo.toml/config.toml + content/\n" +
      "  microblog — Hugo-shaped export from micro.blog\n\n" +
      "If your content is markdown but in a custom layout, you can still run\n" +
      "  make migrate-convert FROM=hugo\n" +
      "and the Hugo adapter will process anything under content/**/*.md.",
  );
  process.exit(1);
}

process.exit(0);
