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

## Non-Player sheets (next): how they map to the bot model

Checked: Non-Player FARC (Andean Abyss), Non-Player Taliban, the Card and Space list and the Sequence of Play (A Distant Plain); the other 5 were not checked. Each Non-Player sheet is one page. Nearly every part maps to data the schema already has:

| Sheet part | Bot model | Status |
|---|---|---|
| "Event?" box, top left: when to play the Event, which side | `eventPolicy.playIf`, `eventPolicy.side` | Have |
| "Event Instructions": one line per card | `eventPolicy.overrides` (with `plain`) | Have |
| Diamonds down the left: yes/no questions | `condition` nodes | Have |
| Operation boxes in the middle, each with a header filter ("In non-Support Depts or Cities") | `action` node and its priority table | Have |
| Numbered priorities ❶ ❷ ❸ in a box | priority table `steps` | Have |
| Shaded lettered tie-breaks ⓐ ⓑ | priority table `tiebreak` | Have |
| "if none" arrow to the next Operation box | `onEmpty` | Have |
| "then" / "with" arrow to a Special Activity box | `linked` with `timing` after / during | Have |
| Special Activity box with priorities and "If none, no Special Activity" | linked table and `skipText` | Have |
| "max 3", "max 6 spaces", "for max 2/3 of Res" | table `limit`, `maxSpaces` | Partly (no share-of-Resources limit) |
| Special Activity fallback chain ("If no such Extort, Infiltrate") | none (one linked Special Activity) | Gap |
| One Operation box with several numbered sub-actions, each with its own effect (Rally: flip, then place Bases, then place Guerrillas) | none (one table chooses spaces; one step list runs in each) | Gap |
| Support-phase box (Agitate) | none (bots make no choices at scoring) | Gap |
| Momentum and Capability box | none (no capabilities in the schema) | Gap |

## Reference sheets (next)

| Sheet | Kit | Data |
|---|---|---|
| Sequence of Play: Eligible faction flow, Pass, scoring card phases | New sheet | `rules.sequence`, `rules.scoring` (have) |
| Card list (by faction order) and Spaces list (type, population) | New sheet | `deck.cards[].order`, `board.spaces` (have) |

## Proposed order

1. Non-Player sheet: one page in the layout above, built from the existing bot data. No schema change.
2. Sequence of Play sheet, Card list and Spaces list. No schema change.
3. Bot model gaps (Special Activity fallback chain, sub-actions, scoring-phase choices). Each needs a schema change and a decision.
