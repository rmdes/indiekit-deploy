import * as hugo from "./hugo.mjs";

export const name = "microblog";

/**
 * micro.blog exports a Hugo-shaped tree (content/, uploads/, hugo.toml).
 * The Hugo adapter handles 95% of it; we just declare the source so future
 * micro.blog-specific tweaks (e.g., `external_url` aliases, status posts)
 * can be applied without forking the Hugo flow.
 */
export async function convert(ctx) {
  return hugo.convert({ ...ctx, source: "microblog" });
}
