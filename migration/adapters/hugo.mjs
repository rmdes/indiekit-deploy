import { globby } from "globby";
import path from "node:path";
import { processFile, defaultCollectCategories } from "../lib/process-file.mjs";

export const name = "hugo";

/**
 * Hugo layout:
 *   content/<section>/<slug>.md            — leaf post
 *   content/<section>/<slug>/index.md      — page bundle (media co-located)
 *   content/<section>/_index.md            — section listing (skipped)
 *
 * Hugo's `section` (top-level folder under content/) is a strong type hint.
 * We map common section names; everything else falls through to the classifier.
 */
const SECTION_HINTS = {
  posts: null,        // ambiguous — let the classifier decide note vs article
  post: null,
  articles: "article",
  notes: "note",
  microposts: "note",
  microblog: "note",
  photos: "photo",
  photo: "photo",
  links: "bookmark",
  bookmarks: "bookmark",
  likes: "like",
  replies: "reply",
  reposts: "repost",
  pages: "page",
  page: "page",
};

export async function convert({ inputDir, overrides, source = "hugo" }) {
  const warnings = [];
  const posts = [];
  const mediaSources = new Map();
  const redirects = [];

  const files = await globby(["content/**/*.{md,markdown}"], { cwd: inputDir });

  for (const rel of files) {
    const base = path.basename(rel);
    if (base.startsWith("_index.")) continue; // Hugo section list page

    const section = sectionFor(rel);
    let folderHint = SECTION_HINTS[section] ?? null;

    // Files directly under content/ (e.g. about.md, bookmarks.md) are pages,
    // not articles. micro.blog and Hugo both put navigation pages at this
    // level. The default Hugo section table doesn't catch them because
    // sectionFor() returns the filename (e.g. "about.md") which isn't in
    // SECTION_HINTS — so the classifier was falling through to "has title →
    // article" and dating them as if they were posts.
    if (path.dirname(rel) === "content") folderHint = "page";

    // Page bundles: <slug>/index.md → slug from parent directory
    let relForSlug = rel;
    if (base === "index.md" || base === "index.markdown") {
      relForSlug = path.dirname(rel);
    }

    const result = await processFile({
      absPath: path.join(inputDir, rel),
      relPath: rel,
      inputDir,
      overrides,
      folderHint,
      collectCategories: defaultCollectCategories,
      computeOriginalUrl: hugoOriginalUrl(section, relForSlug),
      warnings,
    });
    if (!result) continue;
    posts.push(result.post);
    for (const [src, web] of result.mediaSources) mediaSources.set(src, web);
    if (result.redirect) redirects.push(result.redirect);
  }

  return { posts, mediaSources, redirects, warnings, source };
}

function sectionFor(rel) {
  const parts = rel.split("/");
  // ["content", "<section>", ...]
  return parts[1] || "";
}

function hugoOriginalUrl(section, relForSlug) {
  return ({ fm, date, slug }) => {
    if (fm.url) return String(fm.url);
    if (fm.aliases && Array.isArray(fm.aliases) && fm.aliases.length > 0) {
      // First alias is treated as the legacy URL for redirect purposes.
      return String(fm.aliases[0]);
    }
    // Hugo's permalink config is template-driven; we approximate the most common form:
    //   /:section/:year/:month/:slug/
    if (date) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      return `/${section}/${y}/${m}/${slug}/`;
    }
    return `/${section}/${slug}/`;
  };
}
