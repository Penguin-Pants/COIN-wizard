# Bot patterns: research

Goal: derive generic, faction-agnostic bot logic from the Non-Player flowcharts of published COIN games (`examples/non-player-bot-sheets/`), as the basis for universal bots in the wizard.

## Files

- `source/<game>-<faction>.md`: the sheet's text, transcribed word for word, for research only (© GMT Games). Not used by the build, the print kit or the artifact.
- `<game>-<faction>.yaml`: the same logic normalized: game terms replaced by role variables, in the shape of the repo's bot model (`docs/SCHEMA.md`, "Bot decision graph"). `gap:` marks logic the current schema (1.10.0) cannot express. `reading:` marks an interpretation of the sheet's words that the sheet does not state.

## Status

| Sheet | Archetype | Transcript | Logic |
|---|---|---|---|
| Andean Abyss FARC | guerrilla | Done | Done (pilot) |
| Andean Abyss AUC | paramilitary | Done | Done |
| Andean Abyss Cartels | criminal | Done | Done |
| A Distant Plain Taliban | guerrilla | Done | Done |
| A Distant Plain Warlords | criminal | Done | Done |
| A Distant Plain Coalition | state | Done | Done |
| A Distant Plain Government | state | Done | Done |

The A Distant Plain card and space list (`A_Distant_Plain_Non-Player_Bot_Card_and_Space_List.JPEG`) holds no bot logic. A Distant Plain prints its per-card bot instructions only for lasting cards ("Momentum, Capability" box).

## Notation

- `self`, `state`, `rival.<kind>`: factions by role. `self.guerrilla`, `self.base`, `state.cube`, `state.police`: pieces by role; `[underground]`, `[active]` select a state.
- `count(piece, $space)`: pieces in the space being judged (`$space` may be left out). `avail(piece)`: pieces Available.
- `$space.type`: `city`, `province`, `line`. `$space.pop`, `$space.opinion`, `$space.control`.
- Opinion levels: `active_opposition < opposition < neutral < support < active_support` (GMT uses 5 levels; since 1.9.0 a game may have 3 or 5).
- `priorities` are the numbered rows. `mode: sequence` (the usual GMT reading): work down the rows in order and do each row's selection or effect as far as possible, until the limit or the Resources run out. `mode: first`: only the first row with a match applies. Both exist in the model since 1.7.0 (priority table `mode`). `tiebreak` are lettered tie-breaks: under a row (`{ do, tiebreak }`) they apply to that row only, as printed on the sheet; at list level they apply to every row; `then` / `with` link a Special Activity; `onEmpty` is the "if none" arrow.

## Variables found in the pilot (FARC)

| Variable | Meaning | In the model? |
|---|---|---|
| `avail(piece)` | pieces Available | Partly (pools exist; no expression) |
| `canPlace(piece)` | a legal space has room | Yes (1.8.0: `canPlace(piece, space)`) |
| `canAmbush($space)` | the linked Special Activity is legal in the space | Yes (1.8.0: `canDo(action, space)`) |
| `card.order[0]` | first faction on the card | Yes (1.8.0: `card.position == 1`) |
| `turn.position` | 1st or 2nd Eligible | Yes (1.8.0) |
| `scoring.next.final` | next scoring card is the last | Yes (1.9.0: `scoring.nextFinal`) |
| `$space.control` | which side controls the space | No (computed by engine only) |
| opinion with 5 levels | active/passive support and opposition | Yes (1.9.0: `board.opinionLevels` 5) |
| `marker.sabotage`, `marker.terror` | markers on spaces | Yes (markerSet) |
| `attr.econ` | value of a line | Yes (space attrs) |
| cargo pieces (Shipments) as targets | target list mixing pieces and factions | Yes (1.9.0: step `piece`; every piece has an owner faction) |
| tie-breaks per row | a tie-break that applies to one numbered row only | Yes (1.7.0: step `tiebreak`) |
| `mode: sequence` | numbered rows applied in order, each as far as possible | Yes (1.7.0: table `mode`); `parts` (1.5.0) covers rows with different effects |
| target per row | each row acts against its own faction (Kidnap) | Yes (1.8.0: step `target`) |
| movement state | "stay Underground" and "yet to move" | Yes (1.9.0: move `activate`, `unmoved`) |
| per-card event logic | structured actions for one card | Partly (1.10.0: override `node` runs the card side with a space table and an optional target table). Branches inside one card (General Offensive, Kill Zone) and Operations changed by a card (Mono Jojoy) stay plain text |

## Gaps that repeat (7 sheets, schema 1.10.0)

Each `gap:` line in the YAML files names one of these ids. Count: sheets out of 7 that need it. FARC is counted from its pilot notes.

| Id | Gap | Sheets | Count | Size |
|---|---|---|---|---|
| G1 | Keep-back rule: "leave at least 1(2) in each space with …", "do not move the last …", "without exposing the last Underground Guerrilla" | FARC, AUC, Cartels, Taliban, Warlords, Coalition, Government | 7 | Medium |
| G5 | Whether a faction has a human player ("if Non-player Govt", "Enemy players", "Player VPs") | FARC, AUC, Cartels, Taliban, Warlords, Coalition, Government | 7 | Small |
| G7 | `$space.control` as a variable ("COIN Control", "lose no Control", "no FARC Control") | FARC, AUC, Taliban, Warlords, Coalition, Government | 6 | Medium |
| G3 | A predicted outcome of an action: "Terror would shift 3+", "Assault would add 2+ Control", "Rally would place a Base", "Air Strike could remove …" (`canDo` gives legality only) | Cartels, Taliban, Warlords, Coalition, Government | 5 | Large |
| G4 | `avail(piece)`: pieces Available as an expression | FARC, AUC, Cartels, Taliban, Government | 5 | Small |
| G12 | An Operation and a Special Activity interleaved in one space ("Rally AND then Cultivate", "pause Train to Surge", "use Air Lift if unable") | Cartels, Taliban, Warlords, Coalition, Government | 5 | Large |
| G2 | Card effect categories: "card (either part) could shift Support, place Bases, …" (`raisesSelf` and `lowersEnemy` are too coarse) | Taliban, Warlords, Coalition, Government | 4 | Medium |
| G11 | Random selection as a priority row or as the source ("random space", "Random") | AUC, Cartels, Warlords, Government | 4 | Small |
| G16 | Resource budget for one Operation: "max 2/3↓ of Res, all if Res < 9", "do not spend below 41 Res" | Taliban, Warlords, Coalition, Government | 4 | Small |
| G9 | Distance or route cost: "closer to FARC", "lowest cost route" | AUC, Taliban, Government | 3 | Medium |
| G10 | Removal order across factions and piece types in one space ("Bases first", "ⓐ Base ⓑ Troops") | AUC, Cartels, Taliban | 3 | Medium |
| G13 | Spread evenly ("Sweep evenly", "as evenly as possible", "equally from where most") | Cartels, Coalition, Government | 3 | Medium |
| G17 | Loop state as a variable ("Loop: Pass", "If in loop", "unless in loop") | Warlords, Coalition, Government | 3 | Small |
| G6 | "Executing Faction" Event instructions that apply to whichever faction runs the card | AUC, Cartels | 2 | Medium |
| G14 | The next card (look-ahead) | Taliban, Coalition | 2 | Small |
| G18 | Rank spaces by an action's outcome ("for greatest shift") | Warlords, Coalition | 2 | Large (with G3) |
| G20 | A count target ("to equal Player", "as close as possible to # of Support") | Coalition, Government | 2 | Medium |
| G8, G15, G19, G21, G22 | Count of spaces that meet a condition; an SA used for its income; another faction's action run by the bot; a row that reads what earlier rows did; a lasting card in play | 1 each | 1 | Small to medium |

Already in the model, seen on several sheets: if-none chains of Special Activities and a different chain per Operation (1.5.0 linked lists), the diamond that picks the Special Activity (first entry's `trigger`), "next Propaganda final" (`scoring.nextFinal`), per-row tie-breaks and targets, Support-phase choices (`bot.scoring`), Momentum and Capability boxes (`lasting`).

Proposal for the next schema version: `docs/proposals/bot-model-gaps-2.md`.

## Open questions (need the rulebook, not the sheet)

| Sheet | Item | Question |
|---|---|---|
| AA FARC | Event box, green circled "2" | What does the symbol mean in "2nd Eligible and no (2)"? |
| AA FARC | Event footnote "*" | What does rule 8.1 change for 2-player games or a Non-player Government? |
| AA AUC, Cartels | Event box | Same green circled "2" and the same footnote as FARC. |
| ADP Taliban, Warlords, Coalition | "1(2)" with the 2 underlined | Which game setting uses the underlined value (for example a 2-handed game)? |
| ADP Warlords | Rally "with" arrows | Rally has 2 "with" arrows: one to Cultivate, one to the "Warlords at 43+ Res?" diamond. Which Rally case takes which? |
| ADP Warlords | Traffic box | It prints "If no such Cultivate, Traffic." but its arrow goes to Suborn. Is the text a misprint for "If no such Traffic, Suborn"? |
| ADP Coalition | Air Strike box | It prints "If no such Air Lift: …", the same text as the Air Lift box. Is it a misprint for "If no such Air Strike"? |

Answered by the owner:
- AA FARC Kidnap: "selected or Terror" means "selected for Terror".
- AA FARC Attack row 2: row 3 target class first, then row 2 a/b, then most self.guerrilla.
