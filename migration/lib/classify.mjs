import { POST_TYPES } from "./post.mjs";

/**
 * Decide a post's type from its frontmatter, body, and source path.
 * Rule order — first match wins:
 *   1. user override (compiled rules from _classify.yaml)
 *   2. explicit `type:` in frontmatter, if it's a valid Indiekit post type
 *   3. response properties (like-of, repost-of, in-reply-to, bookmark-of)
 *   4. explicit photo signal (frontmatter.photo / images / image)
 *   5. caller-supplied folder hint (e.g., Hugo section "photos/" → photo)
 *   6. has title → article (titled posts are long-form unless overridden above)
 *   7. body is mostly images, no title → photo (micro.blog-style image post)
 *   8. short body, no title → note (micro.blog-style status)
 *   9. fallback → note
 *
 * The title check sits ABOVE the body-shape heuristic so that an article
 * with one inline image at the end isn't reclassified as a photo post.
 */
export function classify({
  frontmatter = {},
  body = "",
  sourcePath = "",
  overrides = [],
  folderHint = null,
}) {
  // 1. user override
  for (const rule of overrides) {
    if (rule.match(sourcePath)) return rule.type;
  }

  // 2. explicit frontmatter type
  if (frontmatter.type && POST_TYPES.includes(frontmatter.type)) {
    return frontmatter.type;
  }

  // 3. response properties
  if (firstDefined(frontmatter, ["like-of", "like_of", "likeOf"])) return "like";
  if (firstDefined(frontmatter, ["repost-of", "repost_of", "repostOf"])) return "repost";
  if (firstDefined(frontmatter, ["in-reply-to", "in_reply_to", "inReplyTo", "reply_to"])) {
    return "reply";
  }
  if (firstDefined(frontmatter, ["bookmark-of", "bookmark_of", "bookmarkOf"])) {
    return "bookmark";
  }

  // 4. explicit photo signal in frontmatter
  if (frontmatter.photo || frontmatter.images || frontmatter.image) return "photo";

  // 5. adapter folder hint (e.g., Hugo section name "photos/" maps to photo)
  if (folderHint && POST_TYPES.includes(folderHint)) return folderHint;

  // 6. titled posts are articles. The body-shape heuristic only runs for
  //    untitled posts (typically micro.blog-style status updates).
  if (frontmatter.title) return "article";

  // 7. untitled body that's mostly images → photo
  if (bodyIsMostlyImages(body)) return "photo";

  // 8. untitled short body → note
  const trimmed = body.trim();
  if (trimmed.length > 0 && trimmed.length < 1000) return "note";

  // 9. fallback
  return "note";
}

function firstDefined(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function bodyIsMostlyImages(body) {
  const imageRe = /!\[[^\]]*\]\([^)]+\)/g;
  if (!imageRe.test(body)) return false;
  const stripped = body.replace(imageRe, "").trim();
  return stripped.length < 50;
}
