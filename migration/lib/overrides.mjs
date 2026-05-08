import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import picomatch from "picomatch";
import { POST_TYPES } from "./post.mjs";

/**
 * Load _classify.yaml from the input directory if present.
 * Returns an array of compiled rules: { match: (path) => boolean, type: string }.
 * Empty array if the file is absent.
 */
export async function loadOverrides(inputDir) {
  const candidates = ["_classify.yaml", "_classify.yml"];
  for (const name of candidates) {
    const p = path.join(inputDir, name);
    try {
      const raw = await fs.readFile(p, "utf8");
      const parsed = yaml.load(raw);
      return compileRules(parsed?.overrides || [], p);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  return [];
}

function compileRules(rules, sourceFile) {
  if (!Array.isArray(rules)) {
    throw new Error(`${sourceFile}: 'overrides' must be a list`);
  }
  return rules.map((rule, i) => {
    if (!rule || typeof rule !== "object") {
      throw new Error(`${sourceFile}: rule #${i + 1} must be an object`);
    }
    if (!rule.pattern || typeof rule.pattern !== "string") {
      throw new Error(`${sourceFile}: rule #${i + 1} missing 'pattern'`);
    }
    if (!POST_TYPES.includes(rule.type)) {
      throw new Error(
        `${sourceFile}: rule #${i + 1} has invalid type '${rule.type}'. ` +
          `Valid: ${POST_TYPES.join(", ")}`
      );
    }
    return {
      pattern: rule.pattern,
      type: rule.type,
      match: picomatch(rule.pattern, { dot: true }),
    };
  });
}
