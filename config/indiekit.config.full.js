/**
 * Indiekit configuration — Full profile
 *
 * All plugins: core + GitHub, Funkwhale, Last.fm, YouTube, RSS,
 * Microsub, Webmentions proxy, Podroll, extra post types.
 *
 * Syndicators are only loaded when their required env vars are set.
 * Environment variables are set in .env (see .env.example for docs).
 */

// Build plugins array dynamically — syndicators only load when configured
const plugins = [
  // Post types (MUST come before preset)
  "@indiekit/post-type-article",
  "@indiekit/post-type-audio",
  "@indiekit/post-type-bookmark",
  "@indiekit/post-type-event",
  "@indiekit/post-type-jam",
  "@indiekit/post-type-like",
  "@indiekit/post-type-note",
  "@indiekit/post-type-photo",
  "@indiekit/post-type-reply",
  "@indiekit/post-type-repost",
  "@indiekit/post-type-rsvp",
  "@indiekit/post-type-video",
  "@rmdes/indiekit-post-type-page",
  // Preset and store (preset must come after post types)
  "@rmdes/indiekit-preset-eleventy",
  "@indiekit/store-file-system",
  // Core endpoints (always loaded)
  "@rmdes/indiekit-endpoint-micropub",
  "@rmdes/indiekit-endpoint-syndicate",
  "@indiekit/endpoint-json-feed",
  "@rmdes/indiekit-endpoint-webmention-sender",
  // IndieNews (safe without config)
  "@rmdes/indiekit-syndicator-indienews",
  // Full profile endpoints (always loaded)
  "@rmdes/indiekit-endpoint-github",
  "@rmdes/indiekit-endpoint-funkwhale",
  "@rmdes/indiekit-endpoint-lastfm",
  "@rmdes/indiekit-endpoint-youtube",
  "@rmdes/indiekit-endpoint-rss",
  "@rmdes/indiekit-endpoint-microsub",
  "@rmdes/indiekit-endpoint-webmentions-proxy",
  "@rmdes/indiekit-endpoint-podroll",
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
  plugins.push("@indiekit/endpoint-webmention-io");
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

  // ─── Store ───

  "@indiekit/store-file-system": {
    directory: "/data/content",
  },

  // ─── Syndicators ───

  "@rmdes/indiekit-syndicator-mastodon": {
    url: process.env.MASTODON_INSTANCE,
    user: process.env.MASTODON_USER,
    accessToken: process.env.MASTODON_ACCESS_TOKEN,
    checked: !!process.env.MASTODON_ACCESS_TOKEN,
    syndicateExternalLikes: true,
    syndicateExternalReposts: true,
  },

  "@rmdes/indiekit-syndicator-bluesky": {
    handle: process.env.BLUESKY_HANDLE,
    password: process.env.BLUESKY_PASSWORD,
    checked: !!process.env.BLUESKY_PASSWORD,
    syndicateExternalLikes: true,
    syndicateExternalReposts: true,
  },

  "@rmdes/indiekit-syndicator-linkedin": {
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    authorName: process.env.LINKEDIN_AUTHOR_NAME,
    authorProfileUrl: process.env.LINKEDIN_PROFILE_URL,
    checked: !!process.env.LINKEDIN_ACCESS_TOKEN,
  },

  "@rmdes/indiekit-endpoint-linkedin": {
    mountPath: "/linkedin",
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  },

  "@rmdes/indiekit-syndicator-indienews": {
    languages: process.env.INDIENEWS_LANGUAGES?.split(",") || ["en"],
    checked: false,
  },

  "@indiekit/endpoint-webmention-io": {
    token: process.env.WEBMENTION_IO_TOKEN,
  },

  // ─── Full profile endpoints ───

  "@rmdes/indiekit-endpoint-github": {
    mountPath: "/githubapi",
    username: process.env.GITHUB_USERNAME,
    token: process.env.GITHUB_TOKEN,
    cacheTtl: 900_000,
    limits: { commits: 10, stars: 20, contributions: 10, activity: 20, repos: 10 },
    repos: [],
    featuredRepos: process.env.GITHUB_FEATURED_REPOS?.split(",") || [],
  },

  "@rmdes/indiekit-endpoint-funkwhale": {
    mountPath: "/funkwhaleapi",
    instanceUrl: process.env.FUNKWHALE_INSTANCE,
    username: process.env.FUNKWHALE_USERNAME,
    token: process.env.FUNKWHALE_TOKEN,
    cacheTtl: 900_000,
    syncInterval: 300_000,
    limits: {
      listenings: 20,
      favorites: 20,
      topArtists: 10,
      topAlbums: 10,
    },
  },

  "@rmdes/indiekit-endpoint-lastfm": {
    mountPath: "/lastfmapi",
    apiKey: process.env.LASTFM_API_KEY,
    username: process.env.LASTFM_USERNAME,
    cacheTtl: 900_000,
    syncInterval: 300_000,
    limits: {
      scrobbles: 20,
      loved: 20,
      topArtists: 10,
      topAlbums: 10,
    },
  },

  "@rmdes/indiekit-endpoint-youtube": {
    mountPath: "/youtubeapi",
    apiKey: process.env.YOUTUBE_API_KEY,
    channels:
      process.env.YOUTUBE_CHANNELS?.split(",").map((handle) => ({
        handle: handle.trim(),
        name: handle.trim().replace("@", ""),
      })) || [],
    cacheTtl: 300_000,
    liveCacheTtl: 60_000,
    limits: { videos: 10 },
  },

  "@rmdes/indiekit-endpoint-rss": {
    mountPath: "/rssapi",
    syncInterval: 900_000,
    maxItemsPerFeed: 50,
    fetchTimeout: 10_000,
    maxConcurrentFetches: 3,
  },

  "@rmdes/indiekit-endpoint-microsub": {
    mountPath: "/microsub",
  },

  "@rmdes/indiekit-endpoint-webmentions-proxy": {
    mountPath: "/webmentions-api",
    token: process.env.WEBMENTION_IO_TOKEN,
    domain: process.env.SITE_URL?.replace(/^https?:\/\//, "").replace(
      /\/$/,
      "",
    ),
    cacheTtl: 60,
  },

  "@rmdes/indiekit-endpoint-podroll": {
    mountPath: "/podrollapi",
    episodesUrl: process.env.PODROLL_EPISODES_URL,
    opmlUrl: process.env.PODROLL_OPML_URL,
    syncInterval: 900_000,
    maxEpisodes: 100,
  },
};
