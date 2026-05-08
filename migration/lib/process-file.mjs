import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { makePost } from "./post.mjs";
import { classify } from "./classify.mjs";
import { slugify, slugFromFilename, dateFromFilename } from "./slugify.mjs";
import { extractMediaRefs, resolveMediaSource } from "./media.mjs";
import { canonicalUrl } from "./frontmatter.mjs";

/**
 * Process a single markdown file into a Post + media references + redirect.
 * Adapter passes in source-specific hints (computeOriginalUrl, folderHint, etc.).
 *
 * Returns { post, mediaSources: Map<absSrc, webPath>, redirect } or null if skipped.
 */
export async function processFile({
  absPath,
  relPath,
  inputDir,
  overrides,
  folderHint = null,
  computeOriginalUrl = () => null,
  collectCategories,
  warnings,
}) {
  const raw = await fs.readFile(absPath, "utf8");
  const parsed = matter(raw, { excerpt: false });
  const fm = parsed.data || {};
  const body = parsed.content || "";

  if (fm.draft === true || fm.published === false) {
    warnings.push(`${relPath}: marked as draft/unpublished — skipping`);
    return null;
  }

  // Date: frontmatter first (more precise — keeps wall-clock time), then
  // filename as fallback for Jekyll-style undated frontmatter.
  let date = fm.date ? parseDate(fm.date) : null;
  if (!date && fm.published) date = parseDate(fm.published);
  if (!date) date = dateFromFilename(path.basename(relPath));
  if (!date) {
    warnings.push(`${relPath}: no date in frontmatter or filename — skipping`);
    return null;
  }

  const slug =
    (fm.slug && slugify(fm.slug)) ||
    slugFromFilename(path.basename(relPath, path.extname(relPath))) ||
    slugify(fm.title);

  const title = fm.title ? String(fm.title).trim() : undefined;
  const category = (collectCategories || defaultCollectCategories)(fm);

  const type = classify({
    frontmatter: fm,
    body,
    sourcePath: relPath,
    overrides,
    folderHint,
  });

  const originalUrl = computeOriginalUrl({ fm, relPath, date, slug, category, type });

  const post = makePost({
    type,
    date,
    slug,
    title,
    category,
    body,
    originalUrl,
    sourcePath: relPath,
    likeOf: fm["like-of"] || fm.like_of,
    repostOf: fm["repost-of"] || fm.repost_of,
    inReplyTo: fm["in-reply-to"] || fm.in_reply_to || fm.reply_to,
    bookmarkOf: fm["bookmark-of"] || fm.bookmark_of,
  });

  // Media references — preserve original web path; we'll copy the file
  // from input → staged/uploads/<webPath>.
  const mediaSources = new Map();
  for (const ref of extractMediaRefs(body)) {
    const src = await resolveMediaSource(ref, {
      inputDir,
      postSourceDir: path.dirname(absPath),
    });
    if (src) {
      mediaSources.set(src, ref);
    } else {
      warnings.push(`${relPath}: unresolved media reference '${ref}'`);
    }
  }

  let redirect = null;
  if (originalUrl) {
    const fromPath = extractUrlPath(originalUrl);
    if (fromPath) redirect = { from: fromPath, to: canonicalUrl(post) };
  }

  return { post, mediaSources, redirect };
}

function parseDate(value) {
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultCollectCategories(fm) {
  const out = [];
  const push = (v) => {
    if (Array.isArray(v)) v.forEach(push);
    else if (typeof v === "string") {
      v.split(/[\s,]+/).filter(Boolean).forEach((s) => out.push(String(s)));
    }
  };
  push(fm.categories);
  push(fm.category);
  push(fm.tags);
  return [...new Set(out.map((c) => c.trim()).filter(Boolean))];
}

export { defaultCollectCategories };

function extractUrlPath(url) {
  try {
    const u = new URL(url, "https://placeholder.example");
    return u.pathname || null;
  } catch {
    if (url.startsWith("/")) return url.split(/[?#]/)[0];
    return null;
  }
}
