# Rubric

Tiers come from three numbers. The rules below are the same ones in `rubricTier` in [render/data.mjs](render/data.mjs), so the build can tell when the data moves a client.

## Feature score

Each of the eight feature columns (everything except the spec version) scores 1 for yes, 0.5 for partial and 0 for no. The maximum is 8.

## Spec grade

The newest protocol version the client negotiates, compared with the list in `spec_versions` at the top of [data/clients.yaml](data/clients.yaml):

| Grade | Meaning |
| --- | --- |
| Current | The newest spec version |
| One behind | The version before it |
| Older | Anything older |
| Not published | Hosted clients that do not say which version they speak |

When a new spec version ships, add it to the front of `spec_versions` and every client moves down a grade until it catches up.

## MCP bugs fixed

Issues closed as completed, divided by issues minus those closed as duplicates. Only issues opened since the current spec was released (`bug_window_start`) count, and only those with "mcp" in the title, except for trackers that are only about MCP. Below 20 issues the rate is not shown, and clients without a public tracker show none.

The rate is coloured green at 40% or more, amber from 15%, and red below 15%. It is a measure of how a team responds to MCP reports, not of how many bugs a client has: a popular client gets more reports.

## Tier rules

Applied in order. The first rule that matches sets the tier.

1. **D** if the client is no longer maintained, or scores 1 or less on an older spec.
2. **S** if it scores 5 or more on the current spec or one behind.
3. **C** if it scores 3 or more on an older spec and fixes under 15% of its MCP issues.
4. **B** if it scores 3 or more but publishes neither a spec version nor a tracker.
5. **A** if it scores 3 or more.
6. **B** if it scores 2 or more.
7. **C** for everything else.

## Exceptions

A client can sit in a tier the rubric does not give it only with a `tier_note` in the data, listed below. The build fails on any other mismatch.

- **opencode** is held at B. On 1.19.4, the npm latest, the rubric gives C. The V2 build, which opencode's own README installs, turns code mode on by default and adds tool search, CIMD and elicitation.
