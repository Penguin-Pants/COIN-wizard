# Bot patterns: research

Goal: derive generic, faction-agnostic bot logic from the Non-Player flowcharts of published COIN games (`examples/non-player-bot-sheets/`), as the basis for universal bots in the wizard.

## Files

- `source/<game>-<faction>.md`: the sheet's text, transcribed word for word, for research only (© GMT Games). Not used by the build, the print kit or the artifact.
- `<game>-<faction>.yaml`: the same logic normalized: game terms replaced by role variables, in the shape of the repo's bot model (`docs/SCHEMA.md`, "Bot decision graph"). `gap:` marks logic the current schema cannot express.

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
- Opinion levels: `active_opposition < opposition < neutral < support < active_support` (GMT uses 5 levels; the 1.6.0 model has 3).
- `priorities` are the numbered rows. `mode: sequence` (the usual GMT reading): work down the rows in order and do each row's selection or effect as far as possible, until the limit or the Resources run out. `mode: first`: only the first row with a match applies (the repo's priority-table rule today). `tiebreak` are lettered tie-breaks; `then` / `with` link a Special Activity; `onEmpty` is the "if none" arrow.

## Variables found so far (pilot)

| Variable | Meaning | In 1.6.0 model? |
|---|---|---|
| `avail(piece)` | pieces Available | Partly (pools exist; no expression) |
| `canPlace(piece)` | a legal space has room | No |
| `card.order[0]` | first faction on the card | No |
| `turn.position` | 1st or 2nd Eligible | No |
| `scoring.next.final` | next scoring card is the last | No |
| `$space.control` | which side controls the space | No (computed by engine only) |
| opinion with 5 levels | active/passive support and opposition | No (3 levels) |
| `marker.sabotage`, `marker.terror` | markers on spaces | Yes (markerSet) |
| `attr.econ` | value of a line | Yes (space attrs) |
| cargo pieces (Shipments) as targets | target list mixing pieces and factions | No |
| `mode: sequence` | numbered rows applied in order, each as far as possible | No: a priority table takes only the first row with a match; `parts` (1.5.0) covers rows with different effects |
