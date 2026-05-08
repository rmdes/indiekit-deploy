import { globby } from "globby";
import path from "node:path";
import { processFile, defaultCollectCategories } from "../lib/process-file.mjs";

export const name = "jekyll";

/**
 * Jekyll layout:
 *   _posts/YYYY-MM-DD-slug.{md,markdown}    — dated posts
 *   _drafts/                                — undated drafts (skipped by default)
 *   _pages/ or top-level *.md               — standalone pages
 */
export async function convert({ inputDir, overrides }) {
  const warnings = [];
  const posts = [];
  const mediaSources = new Map();
  const redirects = [];

  // Posts
  const postFiles = await globby(["_posts/**/*.{md,markdown}"], { cwd: inputDir });
  for (const rel of postFiles) {
    const result = await processFile({
      absPath: path.join(inputDir, rel),
      relPath: rel,
      inputDir,
      overrides,
      collectCategories: defaultCollectCategories,
      computeOriginalUrl: jekyllPostUrl,
      warnings,
    });
    if (!result) continue;
    posts.push(result.post);
    for (const [src, web] of result.mediaSources) mediaSources.set(src, web);
    if (result.redirect) redirects.push(result.redirect);
  }

  // Pages
  const pageFiles = await globby(["_pages/**/*.{md,markdown}", "*.{md,markdown}"], {
    cwd: inputDir,
  });
  for (const rel of pageFiles) {
    if (rel.startsWith("_posts/") || rel.startsWith("_drafts/")) continue;
    const result = await processFile({
      absPath: path.join(inputDir, rel),
      relPath: rel,
      inputDir,
      overrides,
      folderHint: "page",
      collectCategories: defaultCollectCategories,
      computeOriginalUrl: jekyllPageUrl,
      warnings,
    });
    if (!result) continue;
    posts.push(result.post);
    for (const [src, web] of result.mediaSources) mediaSources.set(src, web);
    if (result.redirect) redirects.push(result.redirect);
  }

  return { posts, mediaSources, redirects, warnings };
}

/**
 * Jekyll's default permalink scheme is /:categories/:year/:month/:day/:title:output_ext.
 * Honor an explicit `permalink:` field if present; otherwise compute the default.
 */
function jekyllPostUrl({ fm, date, slug, category }) {
  if (fm.permalink) return String(fm.permalink);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const cat = (category && category[0]) ? `/${category[0]}` : "";
  return `${cat}/${y}/${m}/${d}/${slug}.html`;
}

function jekyllPageUrl({ fm, relPath }) {
  if (fm.permalink) return String(fm.permalink);
  const stripped = relPath.replace(/^_pages\//, "").replace(/\.(md|markdown)$/, "");
  return `/${stripped}/`;
}
