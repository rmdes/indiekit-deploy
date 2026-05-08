# TODO: indiekit-deploy roadmap

Tracks open work on the migration tool and related infrastructure.

## Status — migration tool

| Item | Status |
|------|--------|
| Hugo adapter | ✅ shipped, verified end-to-end on localhost |
| Jekyll adapter | ⚠️ shipped, **untested with real Jekyll content** |
| micro.blog adapter | ✅ migration path proven (rmendes.net runs on a real micro.blog → Indiekit migration; reference output at `indiekit-cloudron/migrated-content/`); ✅ new generic adapter verified against `~/code/Blog-Archives/blog.rmendes.net-2026/` — 2 of 3 bugs found and fixed (top-level page misclass + photo URL loss); 1 wontfix (syndication metadata, intentional drop) |
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

### micro.blog adapter bugs (verified 2026-05-08)

Test setup: 4 representative files from
`~/code/Blog-Archives/blog.rmendes.net-2026/` (a real micro.blog Hugo
export) run through `make migrate-convert`. What worked from the
start: auto-detect picked `microblog`, status posts classified as
note via title fallback, titled posts as article, photo posts via
`images:` frontmatter signal, redirects pulled real `url:` from
frontmatter.

#### Bug 1: Top-level pages misclassify as articles — ✅ FIXED

**Symptom:** `content/about.md` (root-level file with `url: /about/`,
`menu: main`) was landing in `articles/` with a synthetic dated URL.

**Root cause:** `hugo.mjs:sectionFor()` returned the filename
(`about.md`) for root-level files; that didn't match `SECTION_HINTS`,
so the classifier fell through to "has title → article".

**Fix:** in `hugo.mjs`, when `path.dirname(rel) === "content"`, set
`folderHint = "page"`. Also in `frontmatter.mjs`: pages skip the date
prefix in their filename (`pages/<slug>.md` not `pages/YYYY-MM-DD-...`)
and emit `permalink: /<slug>/` so Eleventy renders at the correct URL
without the theme's eleventyComputed regex misfiring.

**Verified:** `about.md` now → `pages/about.md`, frontmatter has
`permalink: /about/` and `original_url: /about/`. Redirect dedup
filter correctly drops the no-op `/about/` → `/about/`.

#### Bug 2: Photo posts lose their image URLs — ✅ FIXED

**Symptom:** `ctait-juste-une.md` had `images:` and `photos:` arrays
in frontmatter; the staged output had neither. Photo posts went
through with no photos.

**Root cause:** `frontmatter.mjs:writeMarkdown()` emitted a fixed
allowlist; non-listed frontmatter was silently dropped.

**Fix:** added `photo` field to the canonical Post model; new
`collectPhotos(fm)` helper in `process-file.mjs` deduplicates URLs
from `photo:` / `photos:` / `images:` / `image:` / `photos_with_metadata[].url`
inputs into a single `photo:` array (Indiekit/microformat convention);
`writeMarkdown` emits `photo:` when populated.

**Verified:** `ctait-juste-une.md` output now has
`photo: [https://pbs.twimg.com/media/FtWBIJSWwAA5_Eu.jpg]`.

#### Bug 3: Cross-post syndication metadata dropped — ❌ WONTFIX (intentional)

**Original concern:** micro.blog frontmatter has `mastodon:`,
`bluesky:`, `nostr:`, `threads:`, `twitter:` blocks with cross-post
URLs/IDs. The adapter drops them.

**Decision (2026-05-08):** intentional. The user's own micro.blog
migration manually stripped these because they're full of noisy
Facebook webmentions and similar — preserving them adds clutter
without value for the migrated site. The original posts on each
syndication target retain their own data. **Adapter behavior is
correct: drop these blocks silently.** No action needed.

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
