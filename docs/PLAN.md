# Plan: COIN Wizard

Date: 2026-11-25. `main`: c7521d9. Schema: `coin-game/1.10.0` (frozen).
This file lists the work still open. Finished work and its evidence are in `docs/ACCEPTANCE.md`.

## Status

| Area | State | Source |
|---|---|---|
| Phases 0 to 12 (wizard, kit, print) | Done | `docs/ACCEPTANCE.md`, "Results" |
| Bot model gaps, items 13 to 21 (schemas 1.5.0 to 1.10.0) | Done | `docs/ACCEPTANCE.md`, rows 13 to 21 |
| GMT sheet research | 7 of 7 sheets done; 5 of 6 rule questions answered; 1.11.0 parts decided | `docs/research/bot-patterns/README.md`, `docs/proposals/bot-model-gaps-2.md` |
| Live artifact | Build c7521d9, schema 1.10.0 (published 2026-11-25) | Artifact `8d21134e-1d1c-4dce-a1b5-57b010d5c92c` |

## Open work

Owner: **Owner** (a person must act or decide) or **Claude** (code or docs, after a go).

### A. Release

| # | Item | Owner | Start when |
|---|---|---|---|
| A1 | Publish the next schema version after it merges: `npm run build`, then publish `dist/index.html` to the artifact | Claude | The owner says "publish" |

### B. Next schema version (1.11.0)

| # | Item | Owner | Start when |
|---|---|---|---|
| B1 | Implement 1.11.0: parts A (player flag), B (`avail`), C (budget), D (Control), E (keep-back), F (card effect categories), G14 (next card) | Claude | After PR 35 merges. One part per PR |
| B2 | Green circled "2" on the AA Event box: check the printed rulebook | Owner | Any time |

### C. Later versions and imports (approved 2026-11-26, review items R7 to R13)

| # | Item | Owner | Source |
|---|---|---|---|
| C1 | Card-driven bot mode (bot decks with draw and flip exits, shared priority tables, die cap): design questions, then its own version | Claude asks, Owner decides | R7 |
| C2 | Import the research data: prototype deck into a sample game; claims with confidence and a contested flag | Claude | R8 |
| C3 | Preset library from the 14-game tables (victory, pass gain, tracks, scoring phases) | Claude | R9 |
| C4 | Initiative Track and Operation limits before scoring | Claude | R11 |
| C5 | Scenarios, optional modules, playtest log, provenance tag | Claude | R12 |
| C6 | Held cards (Pivotal), system-run factions, hidden hands | Claude | R13 |
| C7 | A choice inside one Event card (General Offensive, Kill Zone); an Event that changes an Operation (Mono Jojoy); cost by space type | Owner decides | Earlier items C1 to C3 |
| C8 | The card effect editor does not offer `$target` as a value | Claude | PR 33 |

GMT material in this public repo stays as it is (owner decision R1, 2026-11-26).

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
