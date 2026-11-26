# COIN series analysis (imported)

Cross-game analysis of 18 COIN games and expansions: the shared system, a variation matrix by mechanic, and one summary per game.
Written in our own words, with rulebook section numbers as citations. It holds no rulebook text.

## Source

- Copied on 2026-11-26 from the private repo `Penguin-Pants/COIN_Research`, folder `research/analysis/`, commit b0e7c64. Owner decision: import only this folder (option 1); the research repo stays private and active.
- Lines such as `research/rules/md/<game>--rules.md` in the "Sources" lists name files in that private repo. They are not in this repo.
- Check before import: 0.52% of 10-word runs match the rulebook conversions (highest file 1.5%, `games/02-cuba-libre.md`). The matches are short names and lists, not quoted passages.

## Files

| File | Holds |
|---|---|
| `common-system.md` | Rules most games share, each with a rule citation |
| `variation-matrix.md` | 11 tables: mechanic by game (sequence, victory, spaces, pieces, tracks, events, scoring phases) |
| `games/*.md` | One summary per game: factions, map, operations, special activities, events, victory, bots |

## Known data issues

- Colonial Twilight Initiative Track: `variation-matrix.md` (line 35) says three boxes; `games/07-colonial-twilight.md` (line 50) lists five. Check before use.
- Rows marked "n/v" (not verified) or "inferred" are not rulebook facts. Do not use them as presets or test data.
- Resource ranges (`variation-matrix.md`, line 127) cover some games only.

## Used by

- `docs/PLAN.md` C3 (presets from the 14-game tables) and C4 (Initiative Track, Operation limits before scoring).
- `docs/research/bot-patterns/README.md` (bot gaps G1 to G22).
