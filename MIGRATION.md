# Migrating to registry-driven plugins

`indiekit-deploy` used to ship two hand-maintained plugin profiles (**core** / **full**)
selected by a build arg. It now composes its plugin set from a shared **plugin
registry** + a per-deployment **`config/plugins.yaml`**. This guide covers the new
workflow and how to upgrade an existing deployment.

## What changed

| Before | Now |
|---|---|
| `PROFILE=core\|full` build arg | one composed set — no profiles |
| `docker/indiekit/package.{core,full}.json` (installed set) | generated `.compiled/package.json` (from the registry) |
| `config/indiekit.config.{js,full.js}` (activated set) | generated `.compiled/indiekit.config.js` (from a template) |
| plugin choice by editing two files in sync | plugin choice in one file: `config/plugins.yaml` |
| `make up` / `make up-full` | just `make up` (runs `make compose` first) |

The plugin **catalog + version pins** live in the `plugin-registry` git submodule
(`plugin-registry/plugin-registry.yaml`). Your deployment only records the *deltas*
from the registry defaults, in `config/plugins.yaml`.

## Choosing plugins

Edit `config/plugins.yaml` — list only what differs from the registry defaults
(the `core` tier and the seven base post types are always on). Then recompose + rebuild:

```bash
make plugin-list            # show the current composed set
make plugin-add KEY=github  # enable a plugin (edits plugins.yaml)
make plugin-remove KEY=rss  # disable one
# …or edit config/plugins.yaml by hand, then:
make compose                # regenerate .compiled/
make build && make up       # rebuild + restart with the new set
```

See `plugin-registry/plugin-registry.yaml` for every available key and its tier.

## The config is now a build artifact

`/data/config/indiekit.config.js` is **regenerated from `config/indiekit.config.template.js`
at `make compose` time and re-installed on every container boot.** Do **not** hand-edit
the running config — your edits will be overwritten. Customize instead via:

- **`config/plugins.yaml`** — which plugins load
- **`config/indiekit.config.template.js`** — config structure / per-plugin options (keep the `{{PLUGINS}}` placeholder)
- **`.env`** — values (site name, URLs, tokens, syndicator credentials)

This mirrors how `indiekit-cloudron` treats its config, and it's what makes upgrades safe
(a rebuilt image's plugin set always reaches the running app).

## Upgrading an existing deployment

1. `git pull` then `make init` (initializes the new `plugin-registry` submodule and updates `eleventy-site`).
2. Your plugin set now comes from `config/plugins.yaml`. The shipped default reproduces
   the old **core** profile (all four syndicators + webmention-sender/io + conversations +
   LinkedIn OAuth). If you ran the **full** profile, enable the extra plugins you used
   (`make plugin-add KEY=…` — github, funkwhale, lastfm, youtube, rss, microsub, podroll,
   blogroll, cv, comments, readlater, activitypub, and the extra post types).
3. `make build && make up`.

> **Note:** the first boot after upgrading **overwrites** `/data/config/indiekit.config.js`
> with the newly composed config. If you had hand-edited that file, re-apply those changes
> in `config/indiekit.config.template.js` (structure) or `.env` (values) first — otherwise
> they're lost. This overwrite is also what prevents the old config from referencing a
> plugin the new image no longer installs (which would crash-loop Indiekit).

## Version pins

- **Forked default plugins** (auth, posts, micropub, syndicate, files, share, frontend):
  pinned in the root `package.json` `overrides` field — bump them there.
- **Everything else** (originals + non-default forks): pinned in `plugin-registry.yaml`
  (shared with `indiekit-cloudron`) — bump the registry, then move this repo's submodule
  pointer forward.

## Identity & branding

Per-deployment identity now comes from the **`@rmdes/indiekit-endpoint-site-config`** plugin
(always-on core) — seeded from your `.env` (`SITE_NAME`, `AUTHOR_NAME`, `SITE_DESCRIPTION`,
`SITE_TIMEZONE`, `SITE_LOCALE`) on first boot, then editable in the site-config admin UI.
