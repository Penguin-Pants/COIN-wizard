# Bot patterns: research

Goal: derive generic, faction-agnostic bot logic from the Non-Player flowcharts of published COIN games (`examples/non-player-bot-sheets/`), as the basis for universal bots in the wizard.

## Files

- `source/<game>-<faction>.md`: the sheet's text, transcribed word for word, for research only (© GMT Games). Not used by the build, the print kit or the artifact.
- `<game>-<faction>.yaml`: the same logic normalized: game terms replaced by role variables, in the shape of the repo's bot model (`docs/SCHEMA.md`, "Bot decision graph"). `gap:` marks logic the current schema (1.9.0) cannot express. `reading:` marks an interpretation of the sheet's words that the sheet does not state.

## Status

| Sheet | Archetype | Transcript | Logic |
|---|---|---|---|
| Andean Abyss FARC | guerrilla | Done | Done (pilot) |
| Andean Abyss AUC | paramilitary | | |
| Andean Abyss Cartels | criminal | | |
| A Distant Plain Taliban | guerrilla | | |
| A Distant Plain Warlords | criminal | | |
| A Distant Plain Coalition | state | | |
| A Distant Plain Government | state | | |

## Notation

- `self`, `state`, `rival.<kind>`: factions by role. `self.guerrilla`, `self.base`, `state.cube`, `state.police`: pieces by role; `[underground]`, `[active]` select a state.
- `count(piece, $space)`: pieces in the space being judged (`$space` may be left out). `avail(piece)`: pieces Available.
- `$space.type`: `city`, `province`, `line`. `$space.pop`, `$space.opinion`, `$space.control`.
- Opinion levels: `active_opposition < opposition < neutral < support < active_support` (GMT uses 5 levels; the model has 3).
- `priorities` are the numbered rows. `mode: sequence` (the usual GMT reading): work down the rows in order and do each row's selection or effect as far as possible, until the limit or the Resources run out. `mode: first`: only the first row with a match applies. Both exist in the model since 1.7.0 (priority table `mode`). `tiebreak` are lettered tie-breaks: under a row (`{ do, tiebreak }`) they apply to that row only, as printed on the sheet; at list level they apply to every row; `then` / `with` link a Special Activity; `onEmpty` is the "if none" arrow.

## Variables found so far (pilot)

| Variable | Meaning | In the model? |
|---|---|---|
| `avail(piece)` | pieces Available | Partly (pools exist; no expression) |
| `canPlace(piece)` | a legal space has room | Yes (1.8.0: `canPlace(piece, space)`) |
| `canAmbush($space)` | the linked Special Activity is legal in the space | Yes (1.8.0: `canDo(action, space)`) |
| `card.order[0]` | first faction on the card | Yes (1.8.0: `card.position == 1`) |
| `turn.position` | 1st or 2nd Eligible | Yes (1.8.0) |
| `scoring.next.final` | next scoring card is the last | Yes (1.9.0: `scoring.nextFinal`) |
| `$space.control` | which side controls the space | No (computed by engine only) |
| opinion with 5 levels | active/passive support and opposition | No (3 levels) |
| `marker.sabotage`, `marker.terror` | markers on spaces | Yes (markerSet) |
| `attr.econ` | value of a line | Yes (space attrs) |
| cargo pieces (Shipments) as targets | target list mixing pieces and factions | No |
| tie-breaks per row | a tie-break that applies to one numbered row only | Yes (1.7.0: step `tiebreak`) |
| `mode: sequence` | numbered rows applied in order, each as far as possible | Yes (1.7.0: table `mode`); `parts` (1.5.0) covers rows with different effects |
| target per row | each row acts against its own faction (Kidnap) | Yes (1.8.0: step `target`) |
| per-card event logic | structured actions for one card | No: `eventPolicy.overrides` holds plain text |

## Open questions (need the rulebook, not the sheet)

| Sheet | Item | Question |
|---|---|---|
| AA FARC | Event box, green circled "2" | What does the symbol mean in "2nd Eligible and no (2)"? |
| AA FARC | Event footnote "*" | What does rule 8.1 change for 2-player games or a Non-player Government? |

Answered by the owner:
- AA FARC Kidnap: "selected or Terror" means "selected for Terror".
- AA FARC Attack row 2: row 3 target class first, then row 2 a/b, then most self.guerrilla.
