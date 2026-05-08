# TODO: indiekit-deploy roadmap

Tracks open work on the migration tool and related infrastructure.

## Status — migration tool

| Item | Status |
|------|--------|
| Hugo adapter | ✅ shipped, verified end-to-end on localhost |
| Jekyll adapter | ⚠️ shipped, **untested with real Jekyll content** |
| micro.blog adapter | ⚠️ shipped (thin wrapper over Hugo), **untested** |
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
- [ ] Run a real micro.blog Hugo export end-to-end
- [ ] Confirm the Hugo-adapter wrapper handles the export shape
      (Hugo `content/` + `uploads/YYYY/...` media)
- [ ] Confirm the `_classify.yaml` override pattern works for
      micro.blog's "all posts in one folder" layout
- [ ] Either: write a thin `docs/migration-from-microblog.md` that
      mostly delegates to the Hugo guide, OR fold a "micro.blog
      notes" section into the Hugo guide

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
