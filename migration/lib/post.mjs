// Canonical post model that all adapters produce.
// The frontmatter writer consumes this shape and emits Indiekit-Eleventy markdown.

/**
 * @typedef {object} Post
 * @property {("article"|"note"|"photo"|"like"|"reply"|"repost"|"bookmark"|"page")} type
 * @property {Date} date
 * @property {string} slug
 * @property {string} [title]
 * @property {string[]} category
 * @property {string} body
 * @property {string} [originalUrl]
 * @property {string[]} media
 * @property {string} [likeOf]
 * @property {string} [repostOf]
 * @property {string} [inReplyTo]
 * @property {string} [bookmarkOf]
 * @property {string} sourcePath
 */

export const POST_TYPES = [
  "article",
  "note",
  "photo",
  "like",
  "reply",
  "repost",
  "bookmark",
  "page",
];

const TYPE_TO_FOLDER = {
  article: "articles",
  note: "notes",
  photo: "photos",
  like: "likes",
  reply: "replies",
  repost: "reposts",
  bookmark: "bookmarks",
  page: "pages",
};

export function pluralize(type) {
  const folder = TYPE_TO_FOLDER[type];
  if (!folder) throw new Error(`Unknown post type: ${type}`);
  return folder;
}

export function makePost(partial) {
  if (!POST_TYPES.includes(partial.type)) {
    throw new Error(`Invalid post type: ${partial.type}`);
  }
  if (!partial.date) throw new Error("Post.date is required");
  if (!partial.slug) throw new Error("Post.slug is required");
  if (typeof partial.body !== "string") throw new Error("Post.body must be a string");
  if (!partial.sourcePath) throw new Error("Post.sourcePath is required");

  const date = partial.date instanceof Date ? partial.date : new Date(partial.date);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Post.date is not a valid date: ${partial.date}`);
  }

  const category = Array.isArray(partial.category)
    ? partial.category.filter(Boolean)
    : partial.category
    ? [String(partial.category)]
    : [];

  return {
    type: partial.type,
    date,
    slug: partial.slug,
    title: partial.title || undefined,
    category,
    body: partial.body,
    originalUrl: partial.originalUrl || undefined,
    media: Array.isArray(partial.media) ? partial.media : [],
    likeOf: partial.likeOf || undefined,
    repostOf: partial.repostOf || undefined,
    inReplyTo: partial.inReplyTo || undefined,
    bookmarkOf: partial.bookmarkOf || undefined,
    sourcePath: partial.sourcePath,
  };
}
