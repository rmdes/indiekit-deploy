import fs from "node:fs/promises";
import path from "node:path";

/**
 * Inspect an input directory and guess which adapter to use.
 * Returns { source: "jekyll" | "hugo" | "microblog" | "unknown", evidence: string[] }.
 */
export async function detectSource(inputDir) {
  const evidence = [];
  const has = async (rel) => {
    try {
      await fs.access(path.join(inputDir, rel));
      return true;
    } catch {
      return false;
    }
  };
  const list = async (rel) => {
    try {
      return await fs.readdir(path.join(inputDir, rel));
    } catch {
      return [];
    }
  };

  // Jekyll signals
  const hasJekyllConfig = await has("_config.yml") || await has("_config.yaml");
  const hasPosts = (await list("_posts")).some((f) => /\.(md|markdown)$/i.test(f));
  if (hasJekyllConfig) evidence.push("_config.yml present");
  if (hasPosts) evidence.push("_posts/ contains markdown");
  if (hasJekyllConfig && hasPosts) {
    return { source: "jekyll", evidence };
  }

  // Hugo signals
  const hugoConfigs = ["hugo.toml", "hugo.yaml", "hugo.yml", "hugo.json", "config.toml", "config.yaml", "config.yml", "config.json"];
  let hugoConfig = null;
  for (const c of hugoConfigs) {
    if (await has(c)) { hugoConfig = c; break; }
  }
  const hasContentDir = await has("content");
  if (hugoConfig) evidence.push(`${hugoConfig} present`);
  if (hasContentDir) evidence.push("content/ directory present");

  // micro.blog vs Hugo distinction
  if (hugoConfig && hasContentDir) {
    const isMicroblog = await detectMicroblog(inputDir, hugoConfig);
    if (isMicroblog) {
      evidence.push("micro.blog markers detected");
      return { source: "microblog", evidence };
    }
    return { source: "hugo", evidence };
  }
  if (hasContentDir && !hugoConfig) {
    evidence.push("Hugo-shaped content/ without config — assuming Hugo");
    return { source: "hugo", evidence };
  }

  return { source: "unknown", evidence };
}

async function detectMicroblog(inputDir, configFile) {
  try {
    const raw = await fs.readFile(path.join(inputDir, configFile), "utf8");
    if (/micro\.blog|microblog|micro_blog/i.test(raw)) return true;
  } catch {}
  // micro.blog Hugo exports place uploads under /uploads/YYYY/...
  try {
    const uploadsRoot = path.join(inputDir, "uploads");
    const entries = await fs.readdir(uploadsRoot);
    if (entries.some((e) => /^\d{4}$/.test(e))) return true;
  } catch {}
  return false;
}
