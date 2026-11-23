# Data files

Everything the scorecard shows comes from this folder. `npm run build` reads it, validates it, and writes the README sections, [EVIDENCE.md](../EVIDENCE.md), the PNGs in [assets/](../assets/) and the snapshot in [history/](history/). `npm run check` fails when a required field below is missing, a value is outside its allowed set, a date or URL is malformed, or a key is unknown.

| File | Edited by | Holds |
| --- | --- | --- |
| [meta.yaml](meta.yaml) | maintainers | Review date, spec versions, bug window, image footnote |
| [features.yaml](features.yaml) | maintainers | One entry per column |
| [clients/](clients/) | anyone, by pull request | One file per client |
| [bugs.json](bugs.json) | `npm run bugs` | MCP issue counts per tracker |
| [history/](history/) | `npm run build` | One snapshot per review date |

## meta.yaml

| Field | Required | Meaning |
| --- | --- | --- |
| `as_of` | yes | Date of the last full review, YYYY-MM-DD. No `checked` or `since` date may be later. The history snapshot is named after it. |
| `spec_versions` | yes | Protocol revisions, newest first. The first is current, the second is one behind. |
| `bug_window_start` | yes | Issues opened on or after this date count toward MCP bugs fixed. Must match `window_start` in bugs.json. |
| `image_note` | no | Footnote printed under assets/matrix.png |

## features.yaml

A list, in column order.

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Key used for the cell in every client file |
| `label` | yes | Column header |
| `definition` | yes | One sentence, shown in the README |
| `ref` | yes | Where the feature is defined, or "Client feature" when it is not in the spec |
| `kind` | no | `harness` for a client design that is not part of the MCP spec. Harness features go last and are drawn as their own group. |
| `url` | yes | https link to that definition |
| `spec_date` | no | Date the feature entered the spec, became an official extension, or was first published as a draft, YYYY-MM-DD |
| `spec_source` | with `spec_date` | https link that dates it |
| `spec_event` | with `spec_date` | What happened on that date, shown in the README timeline. Say so when it is a draft and not a released spec. |

## clients/&lt;slug&gt;.yaml

The file name is the client name in lower case with hyphens: `Claude Code` is `claude-code.yaml`.

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Display name |
| `group` | yes | `cli` or `app` (apps and IDEs) |
| `tier` | yes | `S`, `A`, `B`, `C` or `D`, as [the rubric](../methodology/RUBRIC.md) gives |
| `tier_note` | no | Reason for a tier the rubric does not give |
| `note` | no | One line shown under the README table |
| `unmaintained` | no | `true` when the project is archived or read-only |
| `logo` | yes | File name in [assets/logos/](../assets/logos/) |
| `website` | yes | https product page |
| `docs` | no | https documentation, or null |
| `repo` | no | https source or issue repository, or null |
| `version_checked` | no | Version the cells were checked against. Leave out for hosted clients. |
| `npm` | no | npm package, for CLIs the probe installs |
| `tracker` | no | `repo` (owner/name) and `mcp_in_title`, for the fix rate. null when there is no public tracker. |
| `cells` | yes | One entry per id in features.yaml |

### Cells

| Field | Required | Meaning |
| --- | --- | --- |
| `value` | yes | `y`, `p` or `n`, or `na` on the `apps` cell of a `cli` client. The protocol cell holds a version from `spec_versions`, or `not published`. |
| `method` | yes | `probe`, `source`, `docs`, `changelog` or `issue` |
| `source` | yes | https URL of the evidence |
| `evidence` | yes | What the source shows, in Markdown: see [Writing evidence](#writing-evidence) |
| `checked` | yes | Date the source was last opened, YYYY-MM-DD |
| `label` | tool_search only | How the client searches, shown in the table |
| `quality` | tool_search only | `strong` or `basic`, colours the pill in the matrix image |
| `fallback` | protocol only | Older version the client falls back to |
| `since` | no | The first release that shipped the feature: `date` (YYYY-MM-DD, required), `source` (https, required) and `version` (optional, a quoted string). Only on `y` or `p` cells, and never on `list_changed`, which predates the history charts. |

Unknown keys fail the check, so a typo in a field name does not pass silently.

### Writing `evidence`

Evidence is a small Markdown subset, so a long proof stays easy to scan. The client page shows the opening line on the card and the whole text in the proof panel; `EVIDENCE.md`, the matrix tooltip, `llms.txt` and the FAQ use the same text.

- **Open with the verdict in one sentence**, ideally under 25 words: what the source shows and why that gives this value. It is the only part a card shows, so it has to stand on its own.
- **One fact needs nothing more.** Do not pad a short cell into a list.
- **Two or more supporting facts go in a bullet list** under the opening sentence, one fact per bullet, separated from it by a blank line. Keep each bullet to one sentence.
- **Bold** the fact that decides the value: the version, the setting that turns it on, **off by default**, **experimental**, **still open**. One or two bold phrases per cell, not every noun.
- *Italic* for a caveat word the reader must not miss (*not*, *only*), or the title of a doc or release note.
- `Code` for environment variables, flags, settings keys, commands, method names, capability and extension ids, file names and package names.
- `[text](https://...)` links for a second source; the main one goes in `source`. Only `https` links are rendered.
- Use a YAML block scalar (`evidence: |-`) once the text runs to more than one line.
- No headings, tables, images or HTML. No em or en dashes.

```yaml
code_mode:
  evidence: |-
    Docs: Code Mode ships **experimental and off by default**.

    - Turned on with `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1`; needs **v2.1.323** or later, the Anthropic API and an interactive terminal.
    - Changelog 2.1.323 adds it as an opt-in in which Claude writes JavaScript to call its tools.
    - The 2.1.325 bundle still refuses it when the server-side gate "isn't open to your account yet".
```

## bugs.json

Written by `npm run bugs`. `window_start` must equal `bug_window_start`. For each tracker repo: `issues`, `completed` and `duplicates`, as non-negative integers with `completed + duplicates <= issues`.

## history/&lt;as_of&gt;.json

Written by `npm run build`, one file per `as_of` date. For each client slug: `name`, `group`, `tier` and the value of every cell. Older snapshots are kept, so the folder is a record of each review. Do not edit by hand.
