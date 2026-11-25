# Plan: COIN Wizard

Date: 2026-11-25. `main`: c7521d9. Schema: `coin-game/1.10.0` (frozen).
This file lists the work still open. Finished work and its evidence are in `docs/ACCEPTANCE.md`.

## Status

| Area | State | Source |
|---|---|---|
| Phases 0 to 12 (wizard, kit, print) | Done | `docs/ACCEPTANCE.md`, "Results" |
| Bot model gaps, items 13 to 21 (schemas 1.5.0 to 1.10.0) | Done | `docs/ACCEPTANCE.md`, rows 13 to 21 |
| GMT sheet research | 7 of 7 sheets done; gaps compared; next version proposed | `docs/research/bot-patterns/README.md`, `docs/proposals/bot-model-gaps-2.md` |
| Live artifact | Build c7521d9, schema 1.10.0 (published 2026-11-25) | Artifact `8d21134e-1d1c-4dce-a1b5-57b010d5c92c` |

## Open work

Owner: **Owner** (a person must act or decide) or **Claude** (code or docs, after a go).

### A. Release

| # | Item | Owner | Start when |
|---|---|---|---|
| A1 | Publish the next schema version after it merges: `npm run build`, then publish `dist/index.html` to the artifact | Claude | The owner says "publish" |

### B. GMT sheet research

| # | Item | Owner | Start when |
|---|---|---|---|
| B1 | Decide parts A to I of `docs/proposals/bot-model-gaps-2.md` (next schema version, 1.11.0) | Owner | Now |
| B2 | Answer the rulebook questions in `docs/research/bot-patterns/README.md`, "Open questions": Rule 8.1 footnote; the green circled "2"; Mono Jojoy "flip to Underground"; "1(2)"; 3 possible misprints on the A Distant Plain sheets | Owner | Any time. Needs the rulebooks |
| B3 | Implement the approved parts of B1 as schema 1.11.0 | Claude | After B1 |

### C. Bot model gaps still open

| # | Item | Owner | Source |
|---|---|---|---|
| C1 | A choice inside one Event card (General Offensive, Kill Zone). Plain text only | Owner decides, then Claude | `docs/research/bot-patterns/andean-abyss-farc.yaml` |
| C2 | An Event that changes an Operation (Mono Jojoy). Plain text only | Owner decides, then Claude | Same |
| C3 | Cost by space type ("1 Resource per City/Dept, LoCs 0") | Owner decides, then Claude | `docs/SHEETS.md`, "Player faction sheets: the 4 photos not checked before" |
| C4 | The card effect editor does not offer `$target` as a value (schema 1.10.0 allows it) | Claude | PR 33 |

C1 needs gap G3 (a predicted outcome) from the proposal. C2 and C3 are not in it. Decide them with B1.

### D. Human checklist

| # | Item | Owner | Source |
|---|---|---|---|
| D1 | P1: print the test sheet on paper and measure it | Owner | `docs/ACCEPTANCE.md`, "Human checklist" |
| D2 | P2: run the live claim check | Owner | Same |
| D3 | P3: protect `main` on GitHub | Owner | Same |

## Known limits

These are accepted for now. Each needs a decision before a fix.

1. `canPlace` checks only Available pieces and `maxPerSpace`.
2. `canDo` on another faction's action keeps the running bot's `hasEffect`, `raisesSelf` and `lowersEnemy`.
3. A piece target needs the enemy choices at the top level (validator code `option-piece`).
4. `move.count` is 0 outside `activate.if`. Scoring phases do not track moves.
5. `markerSet` on opinion and the opinion values in a dry-run patch are not checked against the scale.
6. The UI test "… all six dry runs pass" failed once under load. The cause is not known.
7. The script that built the sheet comparison page (artifact `74db7d27-…`) is lost.

## Rules for this file

- Update it in the same PR that opens or closes an item.
- When an item is done, delete it here and add its row to `docs/ACCEPTANCE.md`.
