# Proposal: bot model gaps from 7 GMT sheets (next schema version)

Status: proposal, waiting for owner decisions. Nothing is implemented.
Source: `docs/research/bot-patterns/README.md`, "Gaps that repeat". The 7 Non-Player sheets are Andean Abyss FARC, AUC, Cartels and A Distant Plain Taliban, Warlords, Coalition, Government.
Model today: `coin-game/1.10.0`.

## Summary

| Part | Gaps | Sheets | Smallest change | Recommendation |
|---|---|---|---|---|
| A | G5 human player | 7 | Variable `$faction.player` and `player.<faction>`. A dry-run patch sets `players`. Default: a faction is a player unless it has a bot | Approve for 1.11.0 |
| B | G4 pieces Available | 5 | New op `avail(piece, state\|"*")` | Approve for 1.11.0 |
| C | G16 resource budget | 4 | Optional `budget` on an action node: `{ share, allBelow, floor }` (e.g. 2/3 rounded down, all if below 9; never below 41) | Approve for 1.11.0 |
| D | G7 Control | 6 | Optional `rules.control`: a side list (e.g. COIN = Government + Coalition) and the rule "more pieces than all others". Variable `$space.control` (faction id, side id or `none`) | Approve for 1.11.0 |
| E | G1 keep-back | 7 | Optional `keep` on a move or remove step: `{ count, where, state }` ("leave 1(2) Underground at each Base") | Approve for 1.11.0, after design questions |
| F | G2 card effect categories | 4 | Optional `effects: [ ... ]` tags on a card side from a fixed list (shift support, place base, remove enemy, resources, …). Variable `card.does.<tag>` for the side the bot plays and `card.either.<tag>` | Decide |
| G | G3 and G18 predicted outcome | 5 | New op `would(action, measure)`: run the action on a copy of the board, read the change of a measure. Large: the dry run must run an action without a node | Defer to its own version |
| H | G12 Operation and SA interleaved in one space | 5 | Optional `then` on a part or a step: run a Special Activity in this space before the next space | Defer to its own version |
| I | G9, G10, G13, G20, G6, G14 | 2 to 3 each | Distance, removal order, spread evenly, count targets, "Executing Faction" instructions, next card | Defer. Revisit after A to E |

## Covered without a schema change

- **Random as a row (G11, rows only):** a row with its own empty tie-break list (`tiebreak: []`) goes straight to the die (`src/dryrun.mjs`, `tbsOf`). Document it in `docs/SCHEMA.md`. "From random sources" inside an effect stays a gap.
- **Loop state (G17):** the loop pattern (1.5.0 proposal, part B) writes the second pass as separate nodes. "If in loop" is then known when the node is written: the loop node uses its own table. Document it.
- **SA fallback per Operation:** "After Assault: Transport. Otherwise: Govern" is a different linked list on each node (1.5.0).

## Design questions before E (keep-back)

1. Does "1(2)" mean 1, or 2 in some game setting? It is an open rulebook question (README).
2. Is "keep" a limit on the step's count (the step moves fewer pieces), or on the spaces the step may use (a space that would break the rule is not legal)?

## Cost per part

| Part | Files |
|---|---|
| A | `src/expr.mjs`, `src/state.mjs` (patch `players`), `src/plain.mjs`, the dry-run form, `docs/SCHEMA.md` |
| B | `src/expr.mjs`, `src/exprmodel.mjs`, `src/plain.mjs`, the value editor |
| C | schema, `src/dryrun.mjs` (limit math with `per: space`), validator, editor, Non-Player sheet line |
| D | schema `rules.control`, `src/state.mjs` (derive control), `src/expr.mjs`, board step, kit |
| E | schema step field, `src/effects.mjs` (move and remove), validator, step editor, plain text |

## Decisions (owner)

| Part | Decision |
|---|---|
| A to I | Waiting |
