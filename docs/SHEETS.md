# GMT reference sheets: what the kit copies and what is next

Source photos: `examples/player-faction-sheets/` (9 player faction sheets) and `examples/non-player-bot-sheets/` (9 Non-Player and reference sheets) from Andean Abyss, A Distant Plain and Colonial Twilight. The kit copies their layout, not their text.

## Player faction sheets (done)

The 5 sheets checked (Andean Abyss Government and Cartels, A Distant Plain Taliban and Warlords, Colonial Twilight FLN) use one template; the other 4 were not checked. The faction sheet in `src/kit.mjs` (`factionAidHtml`) now follows it. Schema 1.4.0 adds the fields that the template needs.

| Sheet part | Kit |
|---|---|
| Faction name between two faction symbols | Yes |
| Left column "COIN Operations" or "Insurgent Operations", right column "Special Activities" | Yes, by faction type |
| Box per action: name, rule section, colored rule line | Yes (`ruleRef`) |
| Operation fields: Purpose, Location, Cost, Procedure | Yes (`purpose`) |
| Operation tag "+ Extort or Infiltrate?" / "+ any Special Activity?" | Yes, derived from the Special Activities' `accompanies` |
| Special Activity fields: Purpose, Accompanying Op, Location, Procedure; tag "max N spaces"; tinted box | Yes (`accompanies`, `maxSpaces`); the kit also prints Cost |
| Victory box: every faction, this faction marked, final-scoring line | Yes |

## Non-Player sheets (done)

All 9 photos in `examples/non-player-bot-sheets/` were checked: Non-Player AUC, Cartels and FARC (Andean Abyss), Non-Player Coalition, Government, Taliban and Warlords (A Distant Plain), the Card and Space list and the Sequence of Play (A Distant Plain). Each Non-Player sheet is one page. The kit file `kit/<game>.<faction>.nonplayer.html` (`nonPlayerSheetHtml` in `src/kit.mjs`) follows the layout below. The bot aid files in `bots/` stay.

| Sheet part | Bot model | Kit |
|---|---|---|
| Title band: "Non-Player" and the faction name between faction symbols | faction name, symbol | Yes |
| "Event?" box, top left: when to play the Event, which side | `eventPolicy.playIf`, `eventPolicy.side`, `eventPolicy.plain` | Yes. Conditions that run before the Event check (such as "Eligible?") print at the top of this box. |
| "Event Instructions": one line per card, at the bottom | `eventPolicy.overrides` (with `plain`) | Yes, card title then the plain text |
| Diamonds down the left: yes/no questions | `condition` nodes | Yes, with "Yes" and "No" arrow labels |
| Operation boxes in the middle, each with a header filter ("In non-Support Depts or Cities") and "max N" | `action` node, the action's legal-space filter, table `limit` | Yes |
| Numbered priorities ❶ ❷ ❸ in a box | priority table `steps` | Yes |
| Shaded lettered tie-breaks ⓐ ⓑ | priority table `tiebreak` | Yes |
| "Target:" priorities (Andean Abyss Bribe) | action node `target` (opponent table) | Yes |
| "if none" arrow to the next Operation box; "None: Pass" badge | `onEmpty` | Yes, as an arrow label that names its target |
| "then" / "with" arrow to a Special Activity box | `linked` with `timing` after / during | Yes (`before` prints "before") |
| Special Activity box with priorities and "If none, no Special Activity" | linked table and `skipText` | Yes, plus "Only if" from `trigger` |
| "max 3", "max 6 spaces", "for max 2/3 of Res" | table `limit`, `maxSpaces` | Partly (no share-of-Resources limit) |
| Special Activity fallback chain ("If none, Process"; "If no such Eradicate: After Assault: Transport. Otherwise: Govern.") | none (one linked Special Activity) | Gap |
| A diamond between an Operation and its Special Activities picks which one (A Distant Plain: "Aid at 2 or less?", "Warlords at 43+ Res?") | none (`trigger` only says yes or no to one Special Activity) | Gap |
| "Loop" badges: when every Operation fails, run the chart again with looser rules ("Loop: Pass", "Loop: Attack", "If loop: Transport") | none (no second pass) | Gap |
| One Operation box with several numbered sub-actions, each with its own effect (Rally: flip, then place Bases, then place Guerrillas) | none (one table chooses spaces; one step list runs in each) | Gap |
| Support-phase box (Agitate, Elite Backing) | none (bots make no choices at scoring) | Gap |
| Momentum and Capability box; Event box items "If current card is a Momentum Event / Capability" | none (no capabilities in the schema) | Gap |

Differences between the two games, found on the 5 newly checked photos:

- Andean Abyss (AUC, Cartels, FARC): "Event?" box with a short rule and an "Event Instructions" list at the bottom.
- A Distant Plain (Coalition, Government, Taliban, Warlords): "Pass, Event or Operations?" box with a numbered list (Momentum, Capability, which part to play, "If Res < N, Pass"). The Event Instructions are not on these sheets. A Momentum and Capability box sits at the bottom right. The kit uses the Andean Abyss form for the Event box and the Event Instructions list, as the task asks.

## Reference sheets (next)

| Sheet | Kit | Data |
|---|---|---|
| Sequence of Play: Eligible faction flow, Pass, scoring card phases | New sheet | `rules.sequence`, `rules.scoring` (have) |
| Card list (by faction order) and Spaces list (type, population) | New sheet | `deck.cards[].order`, `board.spaces` (have) |

## Proposed order

1. Non-Player sheet: one page in the layout above, built from the existing bot data. No schema change. Done.
2. Sequence of Play sheet, Card list and Spaces list. No schema change.
3. Bot model gaps (Special Activity fallback chain, Special Activity chosen by a diamond, loop, sub-actions, scoring-phase choices, Momentum and Capabilities). Each needs a schema change and a decision.
