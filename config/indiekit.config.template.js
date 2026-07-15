/**
 * Indiekit configuration — TEMPLATE (registry-driven)
 *
 * The plugins array below is filled by scripts/compose-site.mjs from
 * config/plugins.yaml + the plugin-registry. Do NOT hand-edit the plugins array
 * here — edit config/plugins.yaml and recompose. The compiled result lands at
 * .compiled/indiekit.config.js (consumed by the Docker build).
 *
 * RATIONALE — why the plugins array is static (no `if (process.env.X) push`):
 * In the registry model every SELECTED plugin is always loaded. The per-plugin
 * `checked: !!process.env.X` config below already makes a syndicator
 * inactive-but-present when its env vars are unset (same as indiekit-cloudron),
 * so conditional loading is no longer needed. Non-plugin config stays env-driven
 * exactly as before — the blocks below are harmless when a plugin is unconfigured.
 */

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
    // Optional layouts for the post editor's layout selector
    // layouts: [
    //   { name: "Full width", path: "layouts/fullwidth.njk" },
    // ],
  },

  plugins: [
{{PLUGINS}}
  ],

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

  // Conversations endpoint
  "@rmdes/indiekit-endpoint-conversations": {
    mountPath: "/conversations",
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
