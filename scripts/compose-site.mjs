import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import yaml from "js-yaml";
import { composeFromInputs } from "../plugin-registry/scripts/compose-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Thin indiekit-deploy I/O wrapper around the shared compose-core (in the
// plugin-registry submodule). Reads this repo's SINGLE-SITE layout, calls the
// pure composeFromInputs(), and writes the compiled artifacts. The compile
// ALGORITHM lives in plugin-registry/scripts/compose-core.mjs so cloudron and
// indiekit-deploy can never drift on how they turn the registry into a set.
export async function composeSite() {
  const registry = yaml.load(await readFile(path.join(ROOT, "plugin-registry/plugin-registry.yaml"), "utf8"));
  const manifest = yaml.load(await readFile(path.join(ROOT, "config/plugins.yaml"), "utf8")) || {};
  manifest._site = "deploy";
  const basePackageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  // The composer reads config/indiekit.config.template.js as its template. It
  // must carry a {{PLUGINS}} placeholder inside its plugins:[] array — if
  // absent, the composer is a no-op for indiekit.config.js (only package.json
  // gets composed). Non-plugin config (Mongo URL, publication, per-plugin
  // blocks) stays env-driven in the template.
  const template = await readFile(path.join(ROOT, "config/indiekit.config.template.js"), "utf8");

  const result = composeFromInputs(registry, manifest, basePackageJson, template);

  const outDir = path.join(ROOT, ".compiled");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "package.json"), JSON.stringify(result.packageJson, null, 2));
  await writeFile(path.join(outDir, "indiekit.config.js"), result.indiekitConfig);
  await writeFile(path.join(outDir, "plugin-loadout.json"), JSON.stringify(result.loadout, null, 2));

  console.log(`deploy: ${result.loadout.summary.core} core + ${result.loadout.summary.post_types} post_types + ${result.loadout.summary.syndicators} syndicators + ${result.loadout.summary.endpoints} endpoints = ${result.loadout.summary.total} packages (${result.warnings.length} warnings)`);
  for (const w of result.warnings) console.warn(`  warning: ${w}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await composeSite();
}
