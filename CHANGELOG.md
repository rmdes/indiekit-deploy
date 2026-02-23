# Changelog

All notable changes to this project will be documented in this file.

## 2026-02-23 — Feature Parity with Cloudron Deployment

Brought the Docker Compose deployment up to feature parity with the Cloudron deployment (`indiekit-cloudron`), covering URL handling, webmention/conversation APIs, ActivityPub federation, and plugin versions.

### URL Handling (CRITICAL FIX)

- **Reversed Caddy URL redirect direction** — The redirect rules were backwards, sending canonical Indiekit URLs (`/notes/2026/02/22/slug/`) to the old `/content/` format. Now correctly redirects `/content/TYPE/YYYY-MM-DD-slug/` to `/TYPE/YYYY/MM/DD/slug/` (301), matching the Cloudron deployment. Applies to both `Caddyfile` and `Caddyfile.full`.

### Plugin Updates

- **`@rmdes/indiekit-endpoint-conversations`** 1.0.0 → **2.1.2** — Unified webmention/conversation API that aggregates webmention.io data with Bluesky/Mastodon/ActivityPub conversations
- **`@rmdes/indiekit-preset-eleventy`** beta.37 → **beta.38** — Improved permalink handling
- **`@rmdes/indiekit-syndicator-bluesky`** 1.0.12 → **1.0.14**
- **`@rmdes/indiekit-endpoint-syndicate`** beta.32 → **beta.34**
- **`@rmdes/indiekit-endpoint-microsub`** 1.0.31 → **1.0.33**
- **`@rmdes/indiekit-endpoint-webmention-io`** 1.0.5 → **1.0.7**
- **`@rmdes/indiekit-endpoint-homepage`** 1.0.15 → **1.0.16**
- **`@rmdes/indiekit-endpoint-cv`** 1.0.13 → **1.0.19**

### New Plugins (Full Profile)

- **`@rmdes/indiekit-endpoint-activitypub@2.0.9`** — Full ActivityPub federation, making the site an AP actor. Configured via env vars (`AP_HANDLE`, `AP_LOG_LEVEL`, etc.).
- **`@rmdes/indiekit-endpoint-comments@1.0.0`** — Comment system with admin dashboard and JF2 API.

### New Caddy Routes

- `/image/*` — Indiekit image resizing endpoint (thumbnails for `/files` and `/posts`)
- `/comments*` — Comments endpoint (full profile)
- `/activitypub*` — ActivityPub federation with CORS headers (full profile)
- `/nodeinfo/*` — Federation discovery with CORS (full profile)
- ActivityPub content negotiation — Requests with `Accept: application/activity+json` or `application/ld+json` are proxied to Indiekit for AS2 representations (full profile)

### Security Headers

- **CSP `connect-src`**: Added `https:` — allows the service worker to cache external avatars (Mastodon/Bluesky profile images). Without this, avatars fail on first load.
- **CSP `form-action`**: Added `https:` — allows form submissions to external OAuth providers.

### Feed Discovery

- Added **WebSub `Link` headers** on `/feed.xml` and `/feed.json` for hub discovery
- Added `/feed` → `/feed.xml` redirect (301)

### Eleventy Theme

- Updated `eleventy-site` submodule from `8d800e2` to `c7f2841` (50+ commits), including:
  - Auto-conversion of stale `/content/` permalinks in data cascade (`eleventyComputed.js`)
  - Webmention display fixes (deduplication, platform alignment, author-based dedup)
  - Conversations support (dual-fetch from conversations API)
  - Comment system components and recent-comments widget
  - ActivityPub badge and platform detection for interactions
  - Unfurl cards for rich link previews
  - Configurable CV page layout with builder support
  - No-JS graceful fallback

### Environment Template

- Added ActivityPub configuration section to `.env.example` (`AP_HANDLE`, `AP_LOG_LEVEL`, `AP_DEBUG`, `AP_DEBUG_PASSWORD`)
