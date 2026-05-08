import yaml from "js-yaml";
import { pluralize } from "./post.mjs";

/**
 * Render a Post into an Indiekit-Eleventy-shaped markdown document.
 * Keys are emitted in a stable order so converted output is deterministic
 * (helps users grep the staged tree before applying).
 *
 * Note on the `date` field: we pass the Date object (not its ISO string)
 * to yaml.dump so it emits as an unquoted YAML timestamp. js-yaml on the
 * Eleventy side then parses it back to a Date — matching what Indiekit's
 * preset-eleventy produces. A quoted string would stay a string in
 * templates and break `{{ date.toISOString() }}` patterns the theme uses.
 */
export function writeMarkdown(post) {
  const fm = {};
  fm.date = post.date;
  fm.layout = "layouts/post.njk";
  // Pages need an explicit permalink so Eleventy renders at /<slug>/
  // instead of the default filesystem URL /pages/<slug>/. preset-eleventy
  // adds permalink for page-type posts written via Indiekit; we mirror
  // that here for migrated pages.
  if (post.type === "page") fm.permalink = `/${post.slug}/`;
  if (post.title) fm.title = post.title;
  if (post.category && post.category.length === 1) {
    fm.category = post.category[0];
  } else if (post.category && post.category.length > 1) {
    fm.category = post.category;
  }
  if (post.photo && post.photo.length) fm.photo = post.photo;
  if (post.likeOf) fm["like-of"] = post.likeOf;
  if (post.repostOf) fm["repost-of"] = post.repostOf;
  if (post.inReplyTo) fm["in-reply-to"] = post.inReplyTo;
  if (post.bookmarkOf) fm["bookmark-of"] = post.bookmarkOf;
  if (post.originalUrl) fm.original_url = post.originalUrl;

  const yamlStr = yaml.dump(fm, { lineWidth: -1, noRefs: true, quotingType: '"' });
  const body = post.body.replace(/\s+$/, "");
  return `---\n${yamlStr}---\n\n${body}\n`;
}

/**
 * Path inside staged/content/ where this post should be written.
 *
 * Regular posts use Indiekit's preset-eleventy convention:
 *   <type-plural>/YYYY-MM-DD-slug.md   →  Eleventy renders at /TYPE/YYYY/MM/DD/slug/
 *
 * Pages drop the date prefix so the theme's eleventyComputed regex
 * (which matches `content/<type>/YYYY-MM-DD-slug.md`) doesn't fire and
 * synthesize a wrong dated URL. Pages render at /<slug>/ instead.
 *   pages/<slug>.md                    →  Eleventy renders at /<slug>/
 */
export function targetPath(post) {
  if (post.type === "page") {
    return `pages/${post.slug}.md`;
  }
  const dateStr = post.date.toISOString().slice(0, 10);
  return `${pluralize(post.type)}/${dateStr}-${post.slug}.md`;
}

/**
 * Canonical Indiekit URL for this post — what Eleventy serves at,
 * and what we redirect old URLs to.
 */
export function canonicalUrl(post) {
  const dateStr = post.date.toISOString().slice(0, 10);
  const [y, m, d] = dateStr.split("-");
  if (post.type === "page") return `/${post.slug}/`;
  return `/${pluralize(post.type)}/${y}/${m}/${d}/${post.slug}/`;
}
