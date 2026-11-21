# Proposal: bot model gaps (item 3)

Status: decided by the owner on 2026-11-21 (see "Decisions" at the end). Implementation follows in a separate PR, as `coin-game/1.5.0`.
Source of the gaps: `docs/SHEETS.md` ("Non-Player sheets", "Player faction sheets: the 4 photos not checked before").

All approved parts go into one new version, `coin-game/1.5.0`. Every new field is optional, so `migrate` only changes the version (as for 1.4.0). The fingerprint in `test/engine.test.mjs` changes once, with that version.

## Summary

| Part | Gap | Smallest change | Recommendation |
|---|---|---|---|
| A | Special Activity fallback chain; Special Activity chosen by a diamond | `linked` may be a list. The first entry whose `trigger` holds and whose table finds a space runs. | Approve |
| B | "Loop" retries | None. Use more action nodes on the `onEmpty` path with looser tables. | Decline the schema change; document the pattern |
| C | Several numbered sub-actions in one Operation box | `parts` on an action node: a list of `{ text, table, steps }` | Defer |
| D | Support-phase (scoring round) choices | `bot.scoring`: a list of `{ phaseId, table }` | Approve |
| E | Momentum and Capabilities | `lasting: "momentum" \| "capability"` on a card side, plus the variable `card.lasting` | Approve as a print and Event-policy field only |

## A. Special Activity list (fallback chain and diamond choice)

- **GMT:** "If none, Process" (Cartels Cultivate). "If no such Eradicate: After Assault: Transport. Otherwise: Govern." (Government). A diamond picks the Special Activity: "Aid at 2 or less?" (Government), "Warlords at 43+ Res?" (Warlords).
- **Change:** `botNode.linked` accepts one object (as now) or a list of the same objects. The dry run tries the entries in order. The first entry whose `trigger` holds and whose table finds a legal space runs. If none runs, the result is `skipped`.
- **Covers both gaps:** a diamond is the `trigger` of the first entry; "if none" is the next entry. "After Assault: X. Otherwise: Y" is a different list on each Operation node.
- **Rules kept:** each entry must accompany the node's Operation (`accompanies`) and match the Special Activity's timing (`src/validate.mjs:297`). The dry-run result `linked` keeps its form `action:spaces`.
- **Sheet:** Special Activity boxes in list order, with "if none →" arrows between them.
- **Cost:** `src/dryrun.mjs:121` (loop over the list), `src/validate.mjs` (each entry), `src/kit.mjs` and `src/botaid.mjs` (print), the bot editor (add or remove an entry).

## B. Loop (no schema change)

- **GMT:** "Loop: Pass", "Loop: Attack", "If loop: Transport". When every Operation fails, the chart runs again with looser rules.
- **Proposal:** no new field. The graph has no cycles (`docs/SCHEMA.md`, "Bot decision graph"). A designer writes the second pass as more action nodes on the `onEmpty` path, each with a looser table. Add this pattern to `docs/SCHEMA.md`.

## C. Sub-actions in one Operation box (defer)

- **GMT:** Rally: "1 flip Underground, 2 place Bases, 3 place Guerrillas". Each part chooses its own spaces and has its own effect.
- **Smallest change:** `parts` on an action node: `[{ text, table, steps }]`. Each part picks spaces with its table and applies its steps there. The Operation's cost is paid once per chosen space over all parts. The node is empty only when every part is empty.
- **Why defer:** it changes how an Operation runs (one step list per action today, `src/effects.mjs`). This is an engine-contract change, larger than A, D and E. A designer can split the parts into separate actions today.

## D. Scoring-phase choices

- **GMT:** "Elite Backing" (AUC Support Phase): free Rally where no Govt or FARC Control. "Agitate" (FARC).
- **Today:** "The bot makes no choices in a scoring round" (`src/botaid.mjs:99`). A `choose` step takes the first option in dry runs.
- **Change:** optional `bot.scoring: [{ phaseId, table, text }]`. In that phase, a step of this faction that needs a space (`spaces` with `filter`, or `choose`) picks with the table. Ties: the same lettered tie-breaks and die.
- **Sheet:** a "Support phase" box on the Non-Player sheet. **Dry runs:** a new optional case `scoring`.

## E. Momentum and Capabilities (print and Event policy only)

- **GMT:** "If current card is a Capability, see 8.1"; "Momentum, Capability" box (A Distant Plain).
- **Change:** optional `lasting: "momentum" | "capability"` on a card side, and the variable `card.lasting` (`none`, `momentum` or `capability`) for `playIf` and overrides.
- **Not in scope:** what a lasting effect does each turn. That is an engine rule; the side's `text` states it.
- **Kit:** the card prints a "Momentum" or "Capability" tag; the Non-Player sheet lists the bot's overrides for lasting cards in a "Momentum, Capability" box.

## Also found (player sheets, not in the item list)

- Special Activity tag as a phrase ("among 3 spaces", "1 space to 1 space"): optional `spaceText` on an action. Recommend approve.
- Cost by space type ("LoCs 0"): optional `cost.byType` (space type to amount). Recommend defer: it changes `payCost` and the limit math in `src/dryrun.mjs:55`.

## Decisions (owner, 2026-11-21)

| Part | Decision |
|---|---|
| A. `linked` as a list | Approved |
| B. Loop | No schema change (document the pattern) |
| C. `parts` (sub-actions) | Approved (against the recommendation to defer) |
| D. `bot.scoring` tables | Approved |
| E. `lasting` card flag | Approved |
| `spaceText`, `cost.byType` (player sheets) | Not decided; not in the item list |
