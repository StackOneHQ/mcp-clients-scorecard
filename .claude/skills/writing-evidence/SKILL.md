---
name: writing-evidence
description: How to write the evidence field of a data/clients/*.yaml cell, and any copy on the scorecard site, as readable Markdown. Use when adding a client, changing a cell, running the weekly refresh or editing page text in render/site.mjs.
---

# Writing evidence

Every value on the scorecard is backed by a `source` URL and an `evidence` text. The client page shows the first line of `evidence` on the card and the whole text in the proof panel, so the text has to scan.

1. **Verdict first.** One sentence, under 25 words, saying what the source shows and why that gives the value. Keep the source prefix: `Docs:`, `Live probe of 2.1.325:`, `Changelog 1.102:`.
2. **One fact per bullet.** Supporting facts go in `- ` bullets after a blank line. A cell with one fact stays one sentence.
3. **Bold the deciding fact**: the version, the setting, **off by default**, **still open**. One or two per cell.
4. **`code` for identifiers**: env vars, flags, settings keys, commands, method, capability and extension ids, file and package names.
5. *Italic* (with `*`, never `_`) for a caveat word or a doc title. `[text](https://...)` for a second source.
6. Multi-line text uses `evidence: |-`. No headings, tables or HTML. No em or en dashes.

```yaml
code_mode:
  evidence: |-
    Docs: Code Mode ships **experimental and off by default**.

    - Turned on with `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1`; needs **v2.1.323** or later.
    - The 2.1.325 bundle still refuses it when the server-side gate "isn't open to your account yet".
```

The full field reference is [data/README.md#writing-evidence](../../../data/README.md#writing-evidence) and the renderer is `render/evidence.mjs`. After editing, run `npm run build`, `npm run check` and `npm test`, then open the client page and click **See the proof** to read it as a visitor will.
