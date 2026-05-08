# Migrating from Hugo to Indiekit

A step-by-step guide to moving your existing Hugo site into an
indiekit-deploy installation. By the end you'll have your old posts
served at canonical Indiekit URLs, your old Hugo URLs 301-redirecting
to the new ones, and your media files reachable at their original
paths.

This guide assumes you already have a working indiekit-deploy stack
(see [deployment-guide.md](deployment-guide.md)). If you're testing on
localhost first, that's fine too — the migration tool runs identically
in both environments.

## Table of contents

1. [What gets migrated (and what doesn't)](#1-what-gets-migrated-and-what-doesnt)
2. [Quick path (5 steps)](#2-quick-path-5-steps)
3. [Detailed walkthrough](#3-detailed-walkthrough)
4. [How Hugo content maps to Indiekit](#4-how-hugo-content-maps-to-indiekit)
5. [Customizing the classification](#5-customizing-the-classification)
6. [Edge cases](#6-edge-cases)
7. [Verification checklist](#7-verification-checklist)
8. [Troubleshooting](#8-troubleshooting)
9. [Re-running the migration](#9-re-running-the-migration)

## 1. What gets migrated (and what doesn't)

### Migrated

- **Markdown content** — all `.md` files under `content/**`, including
  page bundles (`slug/index.md`)
- **Frontmatter** — title, date, tags, categories, response properties
  (`like-of`, `bookmark-of`, etc.), and Hugo `aliases`
- **Media files** — images, video, audio referenced from posts; copied
  to `migration/staged/uploads/` preserving their original web paths
- **Old URLs → 301 redirects** — for every post, a `redir` directive is
  generated mapping the post's Hugo URL to its new canonical Indiekit URL

### Not migrated

- **Hugo shortcodes** (`{{< youtube >}}`, `{{< figure >}}`, etc.) — pass
  through as literal text in the markdown body. Indiekit's Eleventy
  theme has its own embed handlers (`eleventy-plugin-embed-everything`)
  that may auto-detect some patterns; everything else needs manual
  replacement.
- **Hugo themes, partials, layouts** — Indiekit has its own theme
  (`indiekit-eleventy-theme`); your Hugo theme stays in your old repo
- **Hugo data files** (`data/*.yaml`, `data/*.json`) — not consumed
- **Hugo taxonomies** as separate constructs — Hugo `tags` and
  `categories` both fold into Indiekit's `category` field
- **Multilingual content** — language directories aren't recognized
- **Hugo modules / config / params** — irrelevant after migration
- **Custom output formats** (AMP, custom JSON) — Eleventy generates its
  own RSS, JSON Feed, and sitemap

### Skipped during conversion

- **Drafts** — `draft: true` or `published: false` in frontmatter
- **Posts without dates** — neither frontmatter `date:` nor a
  `YYYY-MM-DD-` filename prefix
- **Section index pages** — `_index.md` files (Hugo section listings)

The converter prints warnings for each skipped file with the reason.

## 2. Quick path (5 steps)

```bash
# 1. Drop your Hugo site into migration/input/
cp -r ~/hugo-site/* migration/input/

# 2. Convert (auto-detects Hugo from hugo.toml + content/)
make migrate-convert FROM=hugo

# 3. Inspect the staged tree
ls migration/staged/content/
cat migration/staged/Caddyfile.redirects

# 4. Apply
make migrate-apply

# 5. Reload Caddy so redirects activate
docker compose restart caddy
```

That's enough for a basic migration. The rest of this guide covers
customization, edge cases, and verification.

## 3. Detailed walkthrough

### Step 1 — Stage your Hugo content

Copy, symlink, or unzip your Hugo site into `migration/input/`:

```bash
# Option A: copy
cp -r ~/hugo-site/* migration/input/

# Option B: symlink (useful if you want to keep iterating in Hugo)
ln -s ~/hugo-site migration/input/source
# Then: make migrate-convert FROM=hugo --input migration/input/source

# Option C: unzip an export
unzip ~/hugo-export.zip -d migration/input/
```

The migrator only reads from `migration/input/`. It never modifies it.

### Step 2 — Verify auto-detection

```bash
$ make migrate-detect

Input directory: /migration/input
Detected source: hugo
Evidence:
  - hugo.toml present
  - content/ directory present
```

If detection fails, you can pass `FROM=hugo` explicitly to the next
step. The Hugo adapter accepts any `content/**/*.md` tree, so it works
even on Hugo sites without a config file in the right place.

### Step 3 — Convert

```bash
$ make migrate-convert FROM=hugo

Running hugo adapter on /migration/input...

============================================================
Conversion complete (source: hugo)
============================================================
  article    142
  bookmark   18
  note       236
  photo      54
  reply      9
  media      287
  redirects  459

Output: /migration/staged
```

The conversion is **idempotent** — every run wipes
`migration/staged/content/` and `staged/uploads/` before writing.
Re-run as many times as you want while iterating on overrides.

### Step 4 — Inspect the staged tree

```bash
$ tree -L 2 migration/staged/

migration/staged/
├── content/
│   ├── articles/        # 142 .md files
│   ├── bookmarks/       # 18
│   ├── notes/           # 236
│   ├── photos/          # 54
│   └── replies/         # 9
├── uploads/             # 287 media files at preserved paths
└── Caddyfile.redirects  # 459 redirect directives
```

A staged article looks like this:

```markdown
---
date: 2024-03-15T10:00:00.000Z
layout: layouts/post.njk
title: Hello world
category:
  - intro
  - meta
original_url: /posts/2024/03/hello/
---

This is my first post.

![banner](/img/banner.png)
```

The `original_url` field is informational — it records where the post
used to live. The redirect handling is in `Caddyfile.redirects`.

### Step 5 — Preview vs live volumes

```bash
$ make migrate-preview

Comparing staged → live volumes
  staged content:  /migration/staged/content
  live content:    /data/content

============================================================
Preview
============================================================
  Content:  459 new, 0 would collide
  Uploads:  287 new, 0 would collide
```

If the preview shows collisions, the apply step will refuse by default.
You can either:
- Remove the colliding live files (if they're stale) and re-preview
- Run `make migrate-apply FORCE=1` to overwrite (use with care)

### Step 6 — Apply

```bash
$ make migrate-apply

============================================================
Apply complete
============================================================
  Content:    459 copied, 0 skipped
  Uploads:    287 copied, 0 skipped
  Redirects:  written → migration-redirects

Content volume updated. The Eleventy watcher will rebuild incrementally;
for a full rebuild run:  make restart

Redirects written to docker/caddy/migration-redirects. To activate them,
ensure your Caddyfile contains `import migration-redirects` inside the
site block (added by default in this repo's Caddyfiles), then reload Caddy:
  docker compose restart caddy
```

`migrate-apply` does three things:
1. Copies `staged/content/**` into the `content` Docker volume
2. Copies `staged/uploads/**` into the `uploads` Docker volume
3. Copies `staged/Caddyfile.redirects` to `docker/caddy/migration-redirects`

The Caddyfile's `import migration-redirects` directive picks up the
new file once Caddy reloads.

### Step 7 — Reload Caddy

```bash
$ docker compose restart caddy
```

Eleventy's watcher detects the new content and rebuilds incrementally
(usually within 30 seconds for a small migration). For a guaranteed
full rebuild:

```bash
$ make restart
```

## 4. How Hugo content maps to Indiekit

### Section → post type

The Hugo adapter inspects the section name (the first folder under
`content/`) and uses it as a hint to the classifier:

| Hugo section | Indiekit type |
|--------------|---------------|
| `content/articles/` | article |
| `content/notes/`, `microposts/`, `microblog/` | note |
| `content/photos/`, `photo/` | photo |
| `content/links/`, `bookmarks/` | bookmark |
| `content/likes/` | like |
| `content/replies/` | reply |
| `content/reposts/` | repost |
| `content/pages/`, `page/` | page |
| `content/posts/`, `post/` | classifier decides per-post |
| anything else | classifier decides per-post |

When the classifier "decides per-post", it walks these rules in order:

1. **User override** in `migration/input/_classify.yaml` (if present)
2. **Explicit `type:`** in frontmatter, if it's a valid Indiekit type
3. **Response properties** — `like-of`, `repost-of`, `in-reply-to`,
   `bookmark-of` in frontmatter
4. **Photo signals** — `photo:` or `images:` in frontmatter
5. **Folder hint** from the table above
6. **Has title** → article (titled posts are long-form)
7. **No title, body mostly images** → photo
8. **No title, body short** → note
9. **Fallback** → note

### Date handling

The migrator looks for a date in this order:

1. Frontmatter `date:` (preferred — preserves wall-clock time)
2. Frontmatter `published:`
3. Filename pattern `YYYY-MM-DD-slug.md`

Dates are emitted as unquoted YAML timestamps so Eleventy parses them
back to JavaScript Date objects, matching what Indiekit's
`preset-eleventy` produces.

### Slug derivation

In order of preference:
1. `slug:` field in frontmatter
2. Filename minus extension (with `YYYY-MM-DD-` prefix stripped)
3. For page bundles (`slug/index.md`), the parent directory name
4. Slugified title

### Default URL approximation for redirects

For each post, the migrator generates a redirect from the Hugo URL to
the canonical Indiekit URL. If your Hugo site uses the default
`[permalinks]` schema, the generated URLs look like:

```
/<section>/<year>/<month>/<slug>/
```

This matches the most common Hugo permalink pattern. If your Hugo site
uses a different scheme (e.g., `/:section/:slug/` without dates, or
custom taxonomy-based paths), you can either:
- Edit `migration/staged/Caddyfile.redirects` directly before applying
- Re-export Hugo with `aliases:` set on each post (the migrator honors
  the first alias as the legacy URL)

### Page bundles

Hugo's `content/posts/my-post/index.md` is supported. The slug derives
from the parent directory name (`my-post`), and any media files
co-located in the bundle (`my-post/foo.png`) get resolved relative to
`index.md` and copied to `staged/uploads/` preserving the original
path.

### Categories and tags

Hugo's `categories` and `tags` arrays both fold into Indiekit's
`category` field, deduplicated. Order is `categories` first, then
`tags`. If you want to keep them separate, edit the staged frontmatter
before applying.

## 5. Customizing the classification

If the auto-classifier puts posts in the wrong type, drop a
`migration/input/_classify.yaml` to force specific files:

```yaml
overrides:
  # Hugo's posts/ section split across two types based on filename
  - pattern: "content/posts/*-link-*.md"
    type: bookmark
  - pattern: "content/posts/*-photo-*.md"
    type: photo

  # A whole folder is replies even though section name is generic
  - pattern: "content/responses/**"
    type: reply

  # micro.blog-style status updates from a sub-tree
  - pattern: "content/posts/2019-*-microblog-*.md"
    type: note
```

Patterns are glob-matched against the file path **relative to
`migration/input/`**. Supported syntax: `*` (single segment), `**`
(any segments), `?` (single char). Rules are evaluated top-to-bottom;
the **first matching rule wins**, and user overrides take precedence
over all automatic classification.

A copy-pasteable starting point lives at
`migration/_classify.example.yaml`.

After editing the YAML, re-run `make migrate-convert FROM=hugo` —
the staged tree is wiped and rebuilt, so changes are immediate.

## 6. Edge cases

### Hugo shortcodes (`{{< youtube id >}}` etc.)

Shortcodes pass through to the markdown body as-is. Indiekit's
Eleventy theme uses `eleventy-plugin-embed-everything`, which auto-
detects YouTube, Vimeo, Mastodon, Bluesky, and Spotify URLs in plain
text. So a YouTube shortcode like `{{< youtube dQw4w9WgXcQ >}}` will
render as literal text after migration — but if you replace it with
the URL `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, Eleventy will
render an embed automatically.

For shortcodes without a clean URL replacement (`{{< figure >}}`,
custom shortcodes), you'll need to convert them to plain markdown
before migration or fix them in the staged tree before applying.

### Custom permalinks

Hugo's `[permalinks]` config can produce URLs like `/:slug/` (no date)
or `/:section/:title/`. The migrator's default URL approximation may
not match these. Two workarounds:

- **Edit the redirects file directly** — `migration/staged/Caddyfile.redirects`
  is a plain text file. Open it, search-and-replace, save. The next
  `make migrate-apply` picks up your edits.
- **Use Hugo `aliases`** — if you set `aliases: [/old-url/]` in your
  Hugo frontmatter, the migrator uses the **first alias** as the
  legacy URL for the redirect. This is the cleanest path if your old
  URLs differ from the migrator's approximation.

### External links

Bookmark posts (`bookmark-of:`) and reposts (`repost-of:`) keep their
external target URL. These don't need redirects — they're just
metadata pointing at someone else's page.

### Markdown variants

Hugo accepts `.md`, `.markdown`, and `.mdx`. The migrator handles all
three. MDX-specific JSX is treated as raw text — Eleventy doesn't
process it.

### Multilingual sites

Not currently supported. Hugo's language directories (`content/en/`,
`content/fr/`) get processed flat — the language code becomes part of
the section name, which throws off post-type classification. If you
have a multilingual site, migrate one language at a time and use
`_classify.yaml` overrides liberally.

## 7. Verification checklist

After `make migrate-apply` and `docker compose restart caddy`:

- [ ] Pick three posts at random and visit their canonical URLs.
      Format: `https://your-domain.com/<type>/YYYY/MM/DD/slug/`
- [ ] Visit `https://your-domain.com/articles/`,
      `/notes/`, `/photos/` etc. — collection pages should list the
      migrated posts in date order
- [ ] Test an old Hugo URL — should 301-redirect to the canonical URL
- [ ] Open a migrated post that has images — verify the images load
      (404 means a media reference didn't resolve)
- [ ] Visit `/feed.xml` and `/feed.json` — the migrated posts should
      appear in the feed
- [ ] Check Indiekit's logs (`docker compose logs indiekit --tail=50`)
      for any errors
- [ ] Check Eleventy logs for build errors
      (`docker compose logs eleventy --tail=50`)

## 8. Troubleshooting

### "X posts didn't migrate"

Look at the convert command's stderr — it prints a warning per skipped
file:

```bash
make migrate-convert FROM=hugo 2>&1 | grep -i warning
```

Common reasons:
- `no date in frontmatter or filename — skipping` → add a `date:` field
- `marked as draft/unpublished — skipping` → set `draft: false`
- `unresolved media reference 'X'` → the file exists but the migrator
  couldn't find it (see media handling below)

### "Posts show in wrong category"

Most cases: use `migration/input/_classify.yaml` overrides
(see [Section 5](#5-customizing-the-classification)).

If overrides aren't enough, you can edit the staged frontmatter
directly between `migrate-convert` and `migrate-apply` — the staged
tree is just plain markdown files on disk.

### "Media references broken"

The migrator searches for media files in this order:
1. Page bundle directory (Hugo `slug/index.md` + `slug/foo.png`)
2. Absolute paths resolved from input root
3. Hugo's `static/` directory
4. Jekyll-style `assets/` at repo root

Files that don't resolve produce a warning and the markdown reference
is left as-is. If your media live somewhere unusual:
- Move them into `migration/input/static/` to match Hugo conventions
- Or copy them manually into `migration/staged/uploads/<web-path>`
  before running `migrate-apply`

### "Old URLs 404 instead of redirecting"

Checklist:
- Did you `docker compose restart caddy` after `migrate-apply`?
- Does `docker/caddy/migration-redirects` contain the redirects?
  (`cat docker/caddy/migration-redirects`)
- Does your Caddyfile import the file?
  (`grep -n migration-redirects docker/caddy/Caddyfile*`)

### "Posts appear at /content/... instead of /articles/YYYY/.../"

This is a beta.34-era convention that should not happen post-beta.36.
Verify your installed plugin versions:

```bash
docker compose exec indiekit sh -c \
  'cat /app/node_modules/@rmdes/indiekit-preset-eleventy/package.json' \
  | grep version
```

Should be `^1.0.0-beta.38` or later. If it's older, pull the latest
images: `docker compose pull && docker compose up -d`.

### "Eleventy doesn't pick up the new posts"

The watcher should detect new files within seconds. If not:
- Check the watcher is running: `docker compose ps eleventy`
- Look for build errors: `docker compose logs eleventy --tail=50`
- Force a full rebuild: `make restart`

If the watcher is stuck in a backoff/retry loop, that usually means a
template error. The most common cause is a malformed frontmatter date
in one of your migrated files — check the warnings from
`migrate-convert` and fix any flagged files, then re-apply.

## 9. Re-running the migration

The conversion is **idempotent**: every `make migrate-convert`
recreates `migration/staged/content/` and `staged/uploads/` from
scratch, so iterating on `_classify.yaml` overrides or fixing
frontmatter and re-running is safe.

The apply step is **collision-safe** by default — it refuses to
overwrite live files. To intentionally overwrite, use:

```bash
make migrate-apply FORCE=1
```

This is mostly useful when you've fixed a frontmatter issue and want
the corrected version to land in the live volume.

To start completely fresh (wipe migrated content from the live
volumes), bring the stack down, remove the named volumes, and bring it
back up:

```bash
docker compose down
docker volume rm indiekit-deploy_content indiekit-deploy_uploads
make up-full
```

Then re-run the migration. **This deletes all content in those
volumes**, including any posts you've created via Indiekit's admin UI
since the migration. Use with care.
