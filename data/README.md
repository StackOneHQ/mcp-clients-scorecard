# Data files

Everything the scorecard shows comes from this folder. `npm run build` reads it, validates it, and writes the README sections, [EVIDENCE.md](../EVIDENCE.md), the PNGs in [assets/](../assets/) and the snapshot in [history/](history/). `npm run check` fails on any field below that is missing or malformed.

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
| `value` | yes | `y`, `p` or `n`. The protocol cell holds a version from `spec_versions`, or `not published`. |
| `method` | yes | `probe`, `source`, `docs`, `changelog` or `issue` |
| `source` | yes | https URL of the evidence |
| `evidence` | yes | What the source shows, in a sentence or a code reference |
| `checked` | yes | Date the source was last opened, YYYY-MM-DD |
| `label` | tool_search only | How the client searches, shown in the table |
| `quality` | tool_search only | `strong` or `basic`, colours the pill in the matrix image |
| `fallback` | protocol only | Older version the client falls back to |
| `since` | no | `date` (YYYY-MM-DD), `version` and `source` (https) of the first release that shipped the feature. Only on `y` or `p` cells. |

Unknown keys fail the check, so a typo in a field name does not pass silently.

## bugs.json

Written by `npm run bugs`. `window_start` must equal `bug_window_start`. For each tracker repo: `issues`, `completed` and `duplicates`, as non-negative integers with `completed + duplicates <= issues`.

## history/&lt;as_of&gt;.json

Written by `npm run build`, one file per `as_of` date. For each client slug: `name`, `group`, `tier` and the value of every cell. Older snapshots are kept, so the folder is a record of each review. Do not edit by hand.
