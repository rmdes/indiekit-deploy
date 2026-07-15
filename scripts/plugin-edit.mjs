import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import yaml from "js-yaml";

// Ported from indiekit-cloudron/scripts/plugin-edit.mjs, adapted to
// indiekit-deploy's SINGLE-SITE layout: one config/plugins.yaml, no SITE arg.
// Toggles a non-core plugin's `enabled` flag, then tells you to recompose.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const TIERS = ["post_types", "syndicators", "endpoints"];

async function findTier(key) {
  const registry = yaml.load(await readFile(path.join(ROOT, "plugin-registry/plugin-registry.yaml"), "utf8"));
  for (const tier of TIERS) {
    if ((registry[tier] || []).some((e) => e.key === key)) return tier;
  }
  if ((registry.core || []).some((e) => e.key === key)) {
    throw new Error(`Cannot edit core plugin '${key}' — core is unmissable by design`);
  }
  return null;
}

async function editManifest(key, action) {
  const tier = await findTier(key);
  if (tier === null) {
    console.warn(`Plugin '${key}' is not in the registry — adding anyway (will produce a warning on compose)`);
  }
  const manifestPath = path.join(ROOT, "config/plugins.yaml");
  const raw = await readFile(manifestPath, "utf8");
  const manifest = yaml.load(raw) || {};
  // Preserve the operator-facing header comments — js-yaml.dump() drops ALL
  // comments, so re-prepend every leading comment/blank line up to the first key.
  const header = (raw.match(/^(?:#.*\n|[ \t]*\n)*/) || [""])[0];
  const targetTier = tier || "endpoints";
  if (!manifest[targetTier]) manifest[targetTier] = {};
  manifest[targetTier][key] = { enabled: action === "add" };
  await writeFile(manifestPath, header + yaml.dump(manifest, { indent: 2 }));
  console.log(`${action === "add" ? "Enabled" : "Disabled"} ${key} (${targetTier})`);
  console.log(`Run 'make compose' to regenerate compiled artifacts.`);
}

const [, , action, key] = process.argv;
if (!["add", "remove"].includes(action) || !key) {
  console.error("Usage: plugin-edit.mjs <add|remove> <key>");
  process.exit(1);
}
await editManifest(key, action);
