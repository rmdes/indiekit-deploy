import * as hugo from "./hugo.mjs";

export const name = "microblog";

/**
 * micro.blog exports a Hugo-shaped tree (content/, uploads/, hugo.toml).
 * The Hugo adapter handles 95% of it; we just declare the source so future
 * micro.blog-specific tweaks (e.g., `external_url` aliases, status posts)
 * can be applied without forking the Hugo flow.
 *
 * Reference output (real-world precedent): the micro.blog → Indiekit
 * migration that powers https://rmendes.net was performed before this
 * generic tool existed. Its output lives at
 * `~/code/indiekit-dev/indiekit-cloudron/migrated-content/{notes,articles,likes}/`
 * and has been running in production since Feb 2026. When verifying this
 * adapter, diff its output against that directory — divergences are
 * either adapter bugs to fix, or improvements worth applying back to
 * the live site (with backup).
 */
export async function convert(ctx) {
  return hugo.convert({ ...ctx, source: "microblog" });
}
