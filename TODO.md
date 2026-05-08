# TODO: indiekit-deploy roadmap

Tracks open work on the migration tool and related infrastructure.

## Status — migration tool

| Item | Status |
|------|--------|
| Hugo adapter | ✅ shipped, verified end-to-end on localhost |
| Jekyll adapter | ⚠️ shipped, **untested with real Jekyll content** |
| micro.blog adapter | ✅ migration path proven (rmendes.net runs on a real micro.blog → Indiekit migration; reference output at `indiekit-cloudron/migrated-content/`); ⚠️ new generic adapter partially verified against `~/code/Blog-Archives/blog.rmendes.net-2026/` — classification + URL preservation work, but **3 adapter bugs found** (see "micro.blog adapter bugs" below) |
| Ghost adapter | ❌ not started |
| WordPress (WXR) adapter | ❌ not started |
| Eleventy-to-Eleventy adapter | ❌ not started |
| Replay-through-Micropub mode | ❌ not started — see migration/README.md |
| CI publishing of migrator image | ✅ shipped |
| Cloudron mirror | ❌ not started |

---

## High priority — finish what we started

### Jekyll deep-dive
The adapter exists (`migration/adapters/jekyll.mjs`) but has not been
exercised against a real Jekyll site. Hugo got the full treatment;
Jekyll deserves the same.

- [ ] Run a real Jekyll fixture end-to-end (e.g., a small Jekyll
      blog from GitHub with `_config.yml`, `_posts/`, `_pages/`)
- [ ] Verify edge cases:
  - [ ] Liquid `{% post_url X %}` references in markdown bodies
  - [ ] `permalink:` field overrides vs default Jekyll URL scheme
  - [ ] `_drafts/` handling (currently silently skipped)
  - [ ] Pages in `_pages/` vs top-level `*.md`
  - [ ] Categories as space-separated string vs array
- [ ] Write `docs/migration-from-jekyll.md` following the template
      established in `docs/migration-from-hugo.md`

### micro.blog verification

The migration path is **proven in production**: rmendes.net was migrated
from micro.blog into Indiekit format, and the resulting content lives at
`indiekit-cloudron/migrated-content/` (notes/, articles/, likes/). That
directory is the canonical reference for what micro.blog → Indiekit
output should look like.

What's unverified is whether the **new generic adapter** in this repo
produces equivalent output when fed a fresh micro.blog Hugo export.

- [ ] Run a fresh micro.blog Hugo export through the new adapter
- [ ] Diff `migration/staged/content/` against
      `~/code/indiekit-dev/indiekit-cloudron/migrated-content/`
- [ ] Where they diverge, decide which is canonical:
  - Cosmetic differences (whitespace, frontmatter ordering) → tolerate
  - Different post-type classification → adapter bug, fix
  - Missing media references → adapter bug, fix
  - Improvements in the new adapter → consider re-migrating the live
    site (separately, with backup)
- [ ] Confirm the `_classify.yaml` override pattern works for
      micro.blog's "all posts in one folder" layout
- [ ] Either: write a thin `docs/migration-from-microblog.md` that
      mostly delegates to the Hugo guide, OR fold a "micro.blog
      notes" section into the Hugo guide

### micro.blog adapter bugs (found 2026-05-08)

Test setup: 4 representative files from
`~/code/Blog-Archives/blog.rmendes.net-2026/` (a real micro.blog Hugo
export) run through `make migrate-convert`. What worked: auto-detect
picked `microblog`, status posts classified as note via title
fallback, titled posts as article, photo posts via `images:`
frontmatter signal, redirects pulled real `url:` from frontmatter.
What broke:

#### Bug 1: Top-level pages misclassify as articles

**Symptom:** `content/about.md` (root-level file with `url: /about/`,
`menu: main`, `weight: 2`) lands in `articles/` and the redirect maps
`/about/` → `/articles/2024/12/08/about/`. Should be a page (no date
in URL, no synthetic year/month/day prefix).

**Root cause:** `migration/adapters/hugo.mjs:sectionFor()` extracts
`parts[1]` as the section. For `content/about.md`, `parts[1]` is
`about.md` — not in `SECTION_HINTS`. Falls through the classifier to
"has title → article".

**Fix shape:** in `hugo.mjs`, detect "file directly under content/"
(parts.length === 2) and treat as page, OR check for page-typical
frontmatter (`menu:`, `weight:`, `navigation:`, single-segment `url:
/<slug>/`). Honor that as a page hint before classifier rule 6.

#### Bug 2: Photo posts lose their image URLs (most damaging)

**Symptom:** `ctait-juste-une.md` had:
```yaml
images:
- https://pbs.twimg.com/media/FtWBIJSWwAA5_Eu.jpg
photos:
- https://pbs.twimg.com/media/FtWBIJSWwAA5_Eu.jpg
photos_with_metadata:
- url: ...; width: 944; height: 1200
```

After conversion, the staged photo post has none of these fields. The
post is correctly classified as photo but **the photos themselves are
gone**. A post-migration site renders "photo posts with no photos" —
defeats the purpose entirely.

**Root cause:** `migration/lib/frontmatter.mjs:writeMarkdown()`
emits a fixed allowlist (`date`, `layout`, `title`, `category`,
response props, `original_url`). All other frontmatter fields are
silently dropped.

**Fix shape:** preserve `photo:` / `photos:` / `images:` arrays when
post type is `photo`. Decide format: keep all three keys, or normalize
to one canonical (e.g., `photo:` per IndieWeb microformat). Also
consider `photos_with_metadata:` for width/height — useful for
responsive image rendering.

**Severity:** highest — silent data loss that makes migrated photo
posts useless.

#### Bug 3: Cross-post syndication metadata silently dropped

**Symptom:** every micro.blog status post has 1-5 syndication blocks
in frontmatter:
```yaml
mastodon: { id, username, hostname }
bluesky: { id, url, link, handle, hostname, did }
nostr: { id, pubkey }
threads: { id, url, username }
twitter: { id, username }
```

These contain real cross-post URLs/IDs that link the migrated post to
where it was originally syndicated. Useful for IndieWeb attribution
("this also appears at: ..."). All silently dropped on output.

**Fix shape:** detect these blocks and gather the URLs into a single
`syndication:` array (Indiekit's microformat convention):
```yaml
syndication:
  - https://mstdn.social/@rmdes/113063980025691863
  - https://bsky.app/profile/.../post/3l34jth3wf42d
  - https://www.threads.net/@rimdesg/post/C_YvKBRSHJI
```

URL templates per platform are well-defined (mastodon:
`https://{hostname}/@{username}/{id}`, bluesky: `link` field already
absolute, threads: `url` field already absolute, twitter: deprecated —
maybe skip).

**Severity:** medium — not destructive (the original post still has
the syndication data on its native platforms), but a cleaner
migration would preserve the breadcrumb trail.

### Real-world Hugo edge cases
The synthetic fixture in our smoke test was tiny and didn't exercise:
- [ ] Hugo page bundles (`slug/index.md` with co-located media)
- [ ] Custom `[permalinks]` schemes from `hugo.toml`
- [ ] Hugo `aliases:` field as legacy URL source
- [ ] Hugo shortcodes (`{{< youtube >}}`, `{{< figure >}}`, etc.)
      passing through as literal text — verify the docs warning is accurate

---

## Medium priority — new source adapters

### Ghost (JSON export)
Ghost exports a single JSON file containing posts, pages, tags, and
authors. Easier than WordPress because there's just one file.

- [ ] Add `migration/adapters/ghost.mjs`
- [ ] Parse Ghost JSON export schema:
  - `db[0].data.posts` → markdown content
  - `db[0].data.tags` → categories
  - `db[0].data.authors` → optional author field
- [ ] Convert Ghost's HTML body (or Mobiledoc) to markdown
      (likely needs `turndown` as a dependency)
- [ ] Decide: download Ghost-hosted images, or leave as remote URLs?
- [ ] Map Ghost post types: `post` → article, `page` → page
- [ ] Write `docs/migration-from-ghost.md`

### WordPress (WXR export)
WordPress's WXR is XML. More work than Ghost — multi-author, complex
shortcodes, attachments as separate post type.

- [ ] Add `migration/adapters/wordpress.mjs`
- [ ] Parse WXR with a real XML parser (e.g., `fast-xml-parser`)
- [ ] Map `wp:post_type`: `post` → article (or classifier),
      `page` → page, `attachment` → media, custom types → classifier
- [ ] Convert WordPress shortcodes:
  - `[gallery]` → markdown image list
  - `[caption]` → markdown image with alt
  - `[embed]` → bare URL (let Eleventy embed plugin handle)
- [ ] HTML body → markdown via `turndown`
- [ ] Multi-author: map to a `byline:` frontmatter field, or fold
      into category, or single-author override?
- [ ] Handle `wp-content/uploads/` media references (download?
      preserve URLs?)
- [ ] Write `docs/migration-from-wordpress.md`

### Other source SSGs (lower priority)
- [ ] **Eleventy-to-Eleventy** — for users moving an existing
      Eleventy blog into an Indiekit-managed Eleventy. Mostly
      identity but with frontmatter normalization.
- [ ] **Astro / Gatsby** — MDX-aware adapter (parse JSX as raw text?
      strip JSX components? convert to markdown?)
- [ ] **Substack** — RSS-only export; would need to fetch full
      content from RSS items
- [ ] **Medium** — HTML export with weird structure
- [ ] **Notion** — markdown export, but with Notion-flavored URLs
      and embed blocks

---

## Tooling improvements

- [ ] **Replay-through-Micropub mode** — POST migrated posts through
      `/micropub` so MongoDB tracks them and the admin UI sees them.
      Currently filesystem-only, which means migrated posts don't
      appear in `/dashboard`'s posts list.
- [ ] **Backup before apply** — auto-snapshot the `content` volume
      before `migrate-apply` writes anything. Currently the only
      protection is the collision refusal; users who pass `FORCE=1`
      have no safety net.
- [ ] **Conflict resolution** — interactive per-file `y/n/a` prompt
      during `migrate-apply` when collisions are detected
- [ ] **Dry-run for `migrate-convert`** — show what would be classified
      where without writing files
- [ ] **Per-file overrides** — extend `_classify.yaml` to set arbitrary
      frontmatter overrides per file (not just `type:`)
- [ ] **Detect partial inputs** — if `migration/input/` only has a
      `_posts/` directory (Jekyll-shaped) without a `_config.yml`,
      auto-detect should probably still say "jekyll" with a note

---

## Cloudron mirror

The same migration tool would benefit `indiekit-cloudron` users, but
the apply step is different — Cloudron uses `cloudron exec` to write
into `/app/data/content/` instead of Docker volume mounts.

- [ ] Decide architecture:
  - Option A: separate copy of `migration/` in `indiekit-cloudron`
  - Option B: shared submodule between deploy and cloudron
  - Option C: single tool with `--target docker|cloudron` flag
- [ ] Cloudron-specific apply: use `cloudron exec --app rmendes.net --
      cp ...` or `cloudron push`
- [ ] Cloudron-specific redirects: nginx config, not Caddy
      (cloudron uses nginx); generate `.map` file for `redirect_uri`
- [ ] Update `indiekit-cloudron` `Makefile` and docs

---

## Documentation gaps

- [ ] `docs/migration-from-jekyll.md` (after Jekyll deep-dive)
- [ ] `docs/migration-from-microblog.md` (or fold into Hugo guide)
- [ ] `docs/migration-from-ghost.md` (after Ghost adapter)
- [ ] `docs/migration-from-wordpress.md` (after WordPress adapter)
- [ ] Cross-link the migration docs from each source's troubleshooting
      section so users coming from one tool find related guides
- [ ] Add a "Choosing your migration target" decision tree if we
      end up with 6+ sources

---

## Known limitations to document explicitly

These are not bugs to fix; they're design choices that users should
know about.

- [ ] Filesystem-only mode means migrated posts don't appear in the
      Indiekit admin UI's posts list
- [ ] Hugo shortcodes pass through as literal text (no shortcode
      processing)
- [ ] Multilingual sites are not supported — language directories
      throw off the section-name classification
- [ ] No backup is taken before `migrate-apply --force`
- [ ] The redirect file format is Caddy-specific; nginx users would
      need to convert (Cloudron mirror should handle this)
