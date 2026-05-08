# Content migration

Migrate an existing static site (Jekyll, Hugo, micro.blog) into your Indiekit
deployment. The migrator is a Docker-only tool — no host-side Node or Python
required.

## Workflow

```
1. Drop export → migration/input/
2. make migrate-detect              # what's in there?
3. make migrate-convert FROM=hugo   # transform → migration/staged/
4. Eyeball migration/staged/         (optional, recommended)
5. make migrate-preview             # what would land in live volumes?
6. make migrate-apply               # actually copy into the volumes
```

Each step is independent and idempotent. You can re-run `migrate-convert`
as many times as needed while iterating on `_classify.yaml` overrides
without dragging stale output forward.

## Supported sources

| `FROM=` | Layout it expects | Notes |
|---------|-------------------|-------|
| `jekyll` | `_config.yml` + `_posts/YYYY-MM-DD-slug.md` | Honors `permalink:` if set, otherwise computes Jekyll's default URL |
| `hugo` | `hugo.toml` (or `config.*`) + `content/**` | Handles page bundles (`slug/index.md`); skips `_index.md` section pages |
| `microblog` | Hugo-shaped export from micro.blog | Thin wrapper over the Hugo adapter |

If detection fails (custom layout, no SSG config), pass `FROM=hugo` —
the Hugo adapter accepts any `content/**/*.md` tree.

## What the converter does

For each markdown file it finds:

1. **Parse frontmatter** with `gray-matter` (YAML, TOML, JSON all accepted)
2. **Classify the post type** (article / note / photo / like / reply /
   repost / bookmark / page) using:
   - your `_classify.yaml` overrides if present
   - explicit `type:` in the frontmatter
   - response properties (`like-of`, `repost-of`, `in-reply-to`, `bookmark-of`)
   - photo signals (frontmatter `photo:` field, body that's only image refs)
   - adapter folder hints (Hugo section names)
   - title-and-length heuristics
3. **Slugify** from filename, frontmatter `slug:`, or title
4. **Resolve media** referenced in the body and copy into `staged/uploads/`,
   preserving the original web path so unchanged markdown still renders
5. **Build a redirect** from the original URL to the canonical Indiekit URL
6. **Write** Indiekit-shaped markdown into `staged/content/<type>/YYYY-MM-DD-slug.md`

Output is grouped under `migration/staged/`:

```
staged/
├── content/
│   ├── articles/2024-03-15-foo.md
│   ├── notes/2024-04-02-quick-thought.md
│   ├── photos/2024-05-10-sunset.md
│   └── ...
├── uploads/
│   ├── assets/sunset.jpg              ← preserved web path
│   └── 2024/05/header.png
└── Caddyfile.redirects                ← import this from your Caddyfile
```

## Override the classifier

Place `migration/input/_classify.yaml` to force specific files into a
specific post type. Patterns are glob-matched against the file path
relative to `input/`. The first matching rule wins; user overrides take
precedence over all automatic classification.

```yaml
overrides:
  - pattern: "_posts/2019-*-microblog-*.md"
    type: note
  - pattern: "content/links/**"
    type: bookmark
```

A copy-pasteable starting point lives at `migration/_classify.example.yaml`.

## Wiring redirects into Caddy

`migrate-convert` writes `staged/Caddyfile.redirects` containing one
`redir` directive per old URL. Import it from your main `Caddyfile`
inside the site block:

```caddy
your-domain.example {
    # ... existing site config ...

    import /etc/caddy/migration-redirects
}
```

Mount the staged file into the Caddy container or copy it into the
`caddy_config` volume — whichever fits your operations preference. The
exact path inside the Caddy container is the value you write after
`import`.

## Apply safety

`migrate-apply` refuses to overwrite files that already exist in the
live `content` or `uploads` volumes. To override, run:

```bash
make migrate-apply FORCE=1
```

This is intentionally noisy: migration is a one-shot operation, and
overwriting a post you've already edited inside Indiekit is the kind of
mistake that's hard to undo.

## Filesystem-only — what that means

This first version writes markdown directly into the `content` volume
and bypasses Indiekit's MongoDB index. Eleventy will render the posts;
they'll be reachable at their canonical URLs and visible in feeds.
**They will not appear in the Indiekit admin UI's posts list**, and the
admin "edit" / "syndicate" buttons won't apply to them.

A future "replay through Micropub" mode will let users re-import the
same staged tree through the Micropub endpoint so MongoDB tracks them
too. Until then, treat migrated posts as historical archive that you
read but rarely edit through Indiekit.

## Out of scope (for now)

- Ghost JSON exports
- WordPress WXR exports
- Eleventy-to-Eleventy migrations
- MDX-aware adapters (Astro, Next.js)
- Replay through Micropub (so posts appear in admin UI)

PRs welcome — the adapter contract is a single `convert(ctx)` function
returning `{ posts, mediaSources, redirects, warnings }`.
