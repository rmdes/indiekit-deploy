/**
 * Indiekit configuration — Core profile
 *
 * Minimal plugin set for a functional IndieWeb blog with Micropub,
 * file storage, syndication, and JSON feed.
 *
 * Syndicators are only loaded when their required env vars are set.
 * Environment variables are set in .env (see .env.example for docs).
 */

// Build plugins array dynamically — syndicators only load when configured
const plugins = [
  // Post types (MUST come before preset)
  "@indiekit/post-type-article",
  "@indiekit/post-type-bookmark",
  "@indiekit/post-type-like",
  "@indiekit/post-type-note",
  "@indiekit/post-type-photo",
  "@indiekit/post-type-reply",
  "@indiekit/post-type-repost",
  "@rmdes/indiekit-post-type-page",
  // Preset and store (preset must come after post types)
  "@rmdes/indiekit-preset-eleventy",
  "@indiekit/store-file-system",
  // Endpoints (always loaded)
  "@rmdes/indiekit-endpoint-micropub",
  "@rmdes/indiekit-endpoint-syndicate",
  "@indiekit/endpoint-json-feed",
  "@rmdes/indiekit-endpoint-webmention-sender",
  "@rmdes/indiekit-endpoint-files",
  // IndieNews (safe without config — just unchecked by default)
  "@rmdes/indiekit-syndicator-indienews",
];

// Conditional syndicators — only load when required env vars are present
if (process.env.MASTODON_INSTANCE) {
  plugins.push("@rmdes/indiekit-syndicator-mastodon");
}
if (process.env.BLUESKY_HANDLE) {
  plugins.push("@rmdes/indiekit-syndicator-bluesky");
}
if (process.env.LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_CLIENT_ID) {
  plugins.push("@rmdes/indiekit-syndicator-linkedin");
  plugins.push("@rmdes/indiekit-endpoint-linkedin");
}
if (process.env.WEBMENTION_IO_TOKEN) {
  plugins.push("@rmdes/indiekit-endpoint-webmention-io");
}

export default {
  application: {
    mongodbUrl: process.env.MONGODB_URL,
    redisUrl: process.env.REDIS_URL || undefined,
    url: process.env.SITE_URL,
    name: process.env.SITE_NAME || "My IndieWeb Blog",
    locale: process.env.SITE_LOCALE || "en",
    timeZone: process.env.SITE_TIMEZONE || "UTC",
  },

  publication: {
    me: process.env.SITE_URL,
    categories: process.env.SITE_CATEGORIES?.split(",") || [
      "blog",
      "notes",
      "links",
      "photos",
    ],
  },

  plugins,

  // Local file storage
  "@indiekit/store-file-system": {
    directory: "/data/content",
  },

  // Mastodon syndication
  "@rmdes/indiekit-syndicator-mastodon": {
    url: process.env.MASTODON_INSTANCE,
    user: process.env.MASTODON_USER,
    accessToken: process.env.MASTODON_ACCESS_TOKEN,
    checked: !!process.env.MASTODON_ACCESS_TOKEN,
    syndicateExternalLikes: true,
    syndicateExternalReposts: true,
  },

  // Bluesky syndication
  "@rmdes/indiekit-syndicator-bluesky": {
    handle: process.env.BLUESKY_HANDLE,
    password: process.env.BLUESKY_PASSWORD,
    checked: !!process.env.BLUESKY_PASSWORD,
    syndicateExternalLikes: true,
    syndicateExternalReposts: true,
  },

  // LinkedIn syndication
  "@rmdes/indiekit-syndicator-linkedin": {
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    authorName: process.env.LINKEDIN_AUTHOR_NAME,
    authorProfileUrl: process.env.LINKEDIN_PROFILE_URL,
    checked: !!process.env.LINKEDIN_ACCESS_TOKEN,
  },

  // LinkedIn OAuth endpoint
  "@rmdes/indiekit-endpoint-linkedin": {
    mountPath: "/linkedin",
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  },

  // IndieNews syndicator
  "@rmdes/indiekit-syndicator-indienews": {
    languages: process.env.INDIENEWS_LANGUAGES?.split(",") || ["en"],
    checked: false,
  },

  // Webmention.io integration
  "@rmdes/indiekit-endpoint-webmention-io": {
    token: process.env.WEBMENTION_IO_TOKEN,
    domain: process.env.SITE_URL?.replace(/^https?:\/\//, "").replace(
      /\/$/,
      "",
    ),
    syncInterval: 900_000,
    cacheTtl: 60,
  },
};
