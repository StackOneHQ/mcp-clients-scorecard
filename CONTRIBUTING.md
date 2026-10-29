# Contributing

Corrections from client teams are the fastest way to keep the [scorecard](README.md) right. Every change needs a public https source that shows the claim. We merge a change once a maintainer has opened the source and read it.

There are two ways to send one.

## Option 1: open a pull request

1. Edit your client's file in [data/clients/](data/clients/), for example `data/clients/claude-code.yaml`. The fields are listed below and in [data/README.md](data/README.md).
2. Run `npm ci && npm run build`. This validates the data and regenerates the README sections, [EVIDENCE.md](EVIDENCE.md), the history snapshot and the images. Images need Chrome. Without it, run `npm run build -- --no-images`: when you push a branch of this repository, the build workflow renders the images and commits them for you. A pull request from a fork gets the same commit only if Actions is enabled on the fork; otherwise say so in the pull request and a maintainer rebuilds the images.
3. Open a pull request and fill in the checklist. CI runs `npm run check`, which fails if the data is invalid or a generated file is stale.

## Option 2: file the evidence form

Use the [submit evidence form](../../issues/new?template=submit-evidence.yml). Give the client, the feature, the value you claim (`y`, `p` or `n`), a source URL, and if you know them the version and date the feature shipped. A maintainer checks the source and opens the pull request.

## Changing a cell

Each cell looks like this:

```yaml
elicitation:
  value: y                  # y, p or n (the protocol cell holds a spec version)
  method: changelog         # probe, source, docs, changelog or issue
  source: https://...       # the page, release or line of code that shows it
  evidence: Form and URL elicitation in 1.102
  checked: 2026-10-27       # the date you opened the source, YYYY-MM-DD
  since:                    # optional: the first release that shipped it
    date: 2025-07-09
    version: "1.102"
    source: https://...     # a release note or changelog entry that dates it
```

What we accept as a source:

- **Docs**: a page on the vendor's own site that describes the feature in the shipped product.
- **Changelog or release**: an entry or release tag that names the feature. This is also what dates `since`.
- **Code**: a GitHub permalink with a commit hash and line number, for clients with public source. Branch links move, so use the commit.
- **Issue or pull request**: a merged pull request that adds the feature, or the vendor's own issue that says it shipped. An open feature request is accepted as the source for `n`.

What we do not accept: screenshots, private links, social posts as the only source, or a future plan offered as the source for `y` or `p`.

Rules for the value:

- `y` needs the feature to work in a released version, on by default or with a documented setting. A feature the vendor labels beta or preview counts as `y` when it meets that bar.
- `p` is for features behind a flag, off by default, experimental, or one of two modes. Say which in `evidence`.
- Moving a cell to `n` needs a source as well, for example a docs page or an open feature request.

Rules for `since`:

- Only add it from a dated release note, changelog entry, release tag or vendor announcement (blog post, press release) that names the feature, or a vendor docs page that names the first version with it.
- Use the date of the first release that shipped it, even behind a flag. Do not move it forward when partial support becomes full.
- Leave it out if you are not sure. Cells without `since` still count in the table and are left out of the time series. See [the methodology](methodology/METHODOLOGY.md#dating-support).

Other fields you can update: `version_checked` (the version you checked against), `website`, `docs`, `repo`, and `note` (one line shown under the table).

## Adding a client

If you build an MCP client, you can list it yourself.

1. Copy [data/clients/_template.yaml](data/clients/_template.yaml) to `data/clients/<slug>.yaml`, where the slug is the client name in lower case with hyphens (`Claude Code` becomes `claude-code`). The build skips files that start with `_`, so the template itself never shows up in the table.
2. Add a square logo (SVG preferred) to [assets/logos/](assets/logos/) and set `logo`.
3. Fill in all nine cells with sources. A feature you do not support is `n` with a link to your MCP docs. For CLIs on npm, set `npm` so the weekly probe checks the handshake.
4. Run `npm run build`. If `tier` does not match what [the rubric](methodology/RUBRIC.md) gives, the build prints the expected tier: set it to that.
5. Open a pull request and say in the Affiliation section that you work on the client.

You can also file the [list a client form](../../issues/new?template=list-client.yml) with your docs and changelog links, and a maintainer writes the file.

## Badge for your README

Each build writes a badge per client to [assets/badges/](assets/badges/), named by the slug, that shows the client's current tier. To show it in your own README:

```markdown
[![MCP clients scorecard](https://raw.githubusercontent.com/StackOneHQ/mcp-clients-scorecard/main/assets/badges/claude-code.svg)](https://github.com/StackOneHQ/mcp-clients-scorecard#scorecard)
```

Replace `claude-code` with your slug. The badge changes when the table does.

## Tiers

Tiers come from the data through [the rubric](methodology/RUBRIC.md), so a pull request changes a tier by changing cells, not by editing `tier` alone. To hold a client in a tier the rubric does not give, add a `tier_note` with the reason; maintainers decide whether it stays.

## Changing the method

To propose a new column, a change to the rubric or a change to how a column is graded, open an issue first. Changes to [render/](render/) and [methodology/](methodology/) go through the same pull request review.

Maintained by [StackOne](https://www.stackone.com).
