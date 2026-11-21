# coin-game/1.3.0 schema guide

File: `schema/coin-game.schema.json` (JSON Schema 2020-12). Example: `examples/tan-war.game.json`.
Rule: one JSON file holds the whole game. Printed text, diagrams and bot aids come from it. Nothing else is a source of truth.

## Top-level sections

| Section | Holds |
|---|---|
| `meta` | Schema version, game id, revision, `draft` or `final`, faction count, supplies, credits |
| `brief` | Conflict text, Wikipedia article, overview, sources (`pending`, `read`, `failed`), claims (`historical` or `design`) |
| `factions` | Name, type, color AND symbol, role, pieces (states, supply), actions, resource track |
| `board` | `spaces`, `links` (legal adjacency), `presentation` (drawing positions, kept apart from links) |
| `tracks` | Id, range, start value |
| `setup` | Placements, space attributes (opinion), pools (Available and Out of Play), track values, eligibility |
| `rules` | Sequence of play table, scoring round phases, rulebook text by section |
| `actions` | Operations and Special Activities: cost, legal-space filter, ordered effect steps |
| `deck` | Cards (Event with two sides, scoring) and deck preparation piles |
| `victory` | Formula and threshold per faction, check timing, final scoring, tie-breaks |
| `bots` | One bot per faction: objective, measures, Event policy, decision graph, priority tables, dice rule, dry runs |

## Versions and migration

`meta.schemaVersion` names the version. This tool writes and validates only the latest version. `migrate(game)` in `src/migrate.mjs` lifts older documents one version at a time and returns a copy. Saved drafts, the last confirmed copy, opened project files and the CLI all migrate on load. Frozen samples of each past version live in `test/fixtures/`.

| Version | Changes |
|---|---|
| 1.3.0 | Full 3 and 4 faction support. New variables for any faction (`resources.<id>`, `eligible.<id>`, `score.<id>`, `margin.<id>`) and for the enemies (`rivals.maxMargin` and similar). New op `factionCount`. Priority tables with scope `opponent` pick an enemy faction; an action node's `target` names one, and its space table reads `$target`. Dry runs may expect a `target`. `other.resources` is removed: migration writes `resources.<first other faction>` in bots and actions, where 1.2.0 meant exactly that. Table scope `piece` is removed (it was never run). |
| 1.2.0 | Effect steps get fixed fields per op (see below). `shift.toward` is `support` or `opposition`; migration maps a faction id or name by faction type (state to `support`, others to `opposition`). `pay` and `markerSet` are defined. Optional `plainOf` on actions and card sides marks stale plain text. |
| 1.1.0 | Adds (all optional): `meta.progress` (wizard step progress), `brief.claims[].check` (claim check result), `factions[].preset`, `bots[].layout` (manual flowchart positions) |
| 1.0.0 | First version |

## Expression language

Used for filters, formulas, conditions and tie-break keys. A value is a literal, `{"var": "..."}` or `{"op": "...", "args": [...]}`.

- Ops: `and or not eq ne gt gte lt lte add sub mul min max count adjCount factionCount sumSpaces anySpace attr`.
- `count(piece, space|"*", state|"*")` counts pieces. `factionCount(faction, space|"*", state|"*")` counts every piece of one faction; the faction can be an id, `$target.id` or `$faction.id`. `adjCount` counts in linked spaces. `sumSpaces` and `anySpace` run an expression once per space.
- Variables: `eligible`, `self.resources`, `resources.<faction>`, `eligible.<faction>`, `score.<faction>` (its victory formula now), `margin.<faction>` (score minus threshold), `rivals.maxMargin|minMargin|maxScore|minScore|maxResources|minResources` (over every enemy), `$faction.id|name|type|resources|eligible|score|margin` (in an opponent table), `$target.…` (same fields, after an action picked its enemy), `track.<id>`, `card.id|hasEffect|raisesSelf|lowersEnemy`, `$space.id|name|type|pop|opinion`, `var.<name>`.
- Booleans count as 1 or 0 in `add` and `mul`.

## Effect steps (no-code mechanics)

Ordered list. Fields per op come from `src/ops.mjs`; the schema's `$defs.step` is generated from it. No other field is allowed. Optional fields in brackets.

| Op | Fields |
|---|---|
| `place` | piece, count, from (pool), to (where), [state, space, spaces, filter] |
| `remove` | piece, count, to (pool), [state, fallbackPiece, space, spaces, filter] |
| `flip` | piece, from (state), to (state), count, [space, spaces, filter] |
| `move` | piece, count, from (loc), to (loc), [state, filter] |
| `shift` | attr (`opinion`), toward (`support` or `opposition`), amount, [space, spaces, filter] |
| `track` | id (track), delta |
| `gain` | track, amount (number or formula) |
| `pay` | track, amount. The step fails when the track holds less than the amount. |
| `roll` | die (`d6`), store (stores the result as `var.<store>`) |
| `markerSet` | marker (a mutable space attribute, like opinion), value, [space, spaces, filter] |
| `if` | test, then, [else] |
| `choose` | options: each has a label and steps |

- count: a whole number, `all`, `any`, `moved` or a formula.
- pool: `available` or `outOfPlay`. where: `$space` (the space being resolved), `choose` or a space id. loc: a where value, `adjacent` or a pool.
- spaces: how many spaces to choose. filter: a condition on `$space` for the chosen spaces.
- The validator checks piece, track and space ids, and that each state belongs to its piece.

## Bot decision graph

- Nodes: `condition` (yes and no), `event-check` (yes and no), `action` (`then` and `onEmpty`, optional `linked` Special Activity), `end` (outcome `none`, `event`, `operation`, `operationSpecial`, `pass`).
- Every non-end node needs both branches. Loops are not allowed. Every node must be reachable.
- Event check order: override for the card id (`force`, `ignore`, `conditional`), else `playIf`. A card needs an effect to be played.
- Opponent table (`scope: opponent`): picks one enemy faction. Steps and tie-breaks read `$faction`. Ties left after the lettered tie-breaks go to the die, as for spaces.
- Action node `target`: an opponent table. The bot picks the enemy first; no enemy qualifies means the same as no space (`onEmpty`). The space table and the linked Special Activity read `$target`. A dry-run result records `target`.
- Priority table: numbered steps (first step with any match wins), lettered tie-breaks (`max` or `min`), `select` `one` or `all` (`all` needs a `limit`; leftover ties break by space name).
- Random tie: sort tied spaces by name. Roll one die. With N spaces, die faces split into N equal groups in list order. A tie with no explicit die is an error.
- Linked Special Activity: runs after the Operation when `trigger` is true and the table finds a legal space. A dry run pays the Operation's cost and applies its effect steps first (`src/effects.mjs`), so the trigger, the legal spaces and the table read the board after the Operation (timing `after` or `during`). With timing `before`, the Operation's cost is set aside first, then the Special Activity resolves on the board before the Operation's steps, and the steps apply after it. Placed and moved pieces use the piece's `defaultState` when a step names no state, and stop at `maxPerSpace`. Example: Tan War `cw.d7`.
- Choices inside effect steps, in dry runs: `choose` takes the first option. Count `any` moves or flips as many as it can. `move` from `adjacent` takes pieces from linked spaces in name order. A `roll` takes the next die of the dry run (none left is an error). A step that needs a player to pick a space (`choose`, or `spaces` with `filter`) is an error.
- Dry runs: `patch` on the setup state (`eligible`, `resources`, `tracks`, `card`, `dice`, `clearPieces`, `spaces.<id>.opinion`, `spaces.<id>.pieces.<piece>`) plus the `expect`ed outcome, path, chosen spaces, side and linked result. Six cases are required: `ineligible`, `event-override`, `no-target`, `tie`, `linked-sa`, `fallback`.

## Validation

Run `npm run validate`. Errors carry a JSON path, a code, a plain message and the editor to open. A `final` revision needs `confirmedAt` and zero errors. Warnings (such as a pending source) do not block.

## Exports

Run `npm run export` for a folder, or `node src/cli.mjs zip <game.json> <out.zip>` for the same zip the wizard downloads. The kit holds `game.json`, a rulebook, a setup sheet, the board SVG, card sheets, counters, a component list, a print test sheet (50 mm ruler, one card and one counter at true size) and one faction aid per faction. Per bot: aid (`.md`, `.html`), flowchart (`.mmd` and rendered `.svg`), policy (`.yaml`) and structured data (`.json`). An unconfirmed game marks every file DRAFT.

## Engine contract (frozen)

`coin-game/1.3.0` is frozen. The engine must accept this version. `test/engine.test.mjs` holds a fingerprint of the schema file and fails on any change: a change needs a new version and a `migrate` step.

Rules the schema alone does not say:

- Sequence of play: the first two Eligible factions in the card's faction order act (COIN style), for 2 to 4 factions. Factions that act become Ineligible, except after the choices in `eligibilityAfter.staysEligible`.
- Opinion is one axis per space: +1 is Support, -1 is Opposition. `shift.toward` moves it toward that side.
- Tracks stay inside `min` to `max`: a `track` or `gain` change stops at the end of the track. `pay` fails when the track holds less than the amount. (This tool does not run effects. These are rules for the engine to implement.)
- `markerSet` sets a mutable space attribute (a marker). Markers start from `setup.spaceAttributes`. Example: Tan War Martial Law (`crown.martial-law`) sets `curfew` to `true`; every space starts with `curfew: false`.
- With 3 or 4 factions a bot names its enemy through an opponent table, never by faction order. `card.lowersEnemy` means the card hurts at least one enemy faction.
- A bot never asks the player to pick: every action node chooses through a priority table, ties go to the lettered tie-breaks and then to `randomization`.
- Each dry run states the board change (`patch`) from setup and the expected `outcome`, `path`, `chosen` spaces, `side` and `linked` result.
