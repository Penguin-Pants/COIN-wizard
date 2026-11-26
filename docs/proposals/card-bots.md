# Proposal: card-driven bot mode (plan item C1)

Status: rounds 1 and 2 decided by the owner on 2026-11-26. Nothing is implemented. Next: its own schema version.
Approval: review item R7 (2026-11-26), "Design questions first, then its own version" (`docs/proposals/bot-model-gaps-2.md`).
Model today: `coin-game/1.11.0`. Each bot has one flowchart (`nodes`), its own priority tables, Event rules and dry runs.

## What the games do

Eight newer volumes run bots from a small card deck instead of a flowchart. ABB uses a related mini-deck.

| Family | Games | Deck use | Source |
|---|---|---|---|
| Jacquard | FITL Tru'ng, CL Calixto, FoS Tay Son, SoD Minh Mang, GAN Arjuna, PP Bonifacio, RDR Curiosity, CW Sun Wukong | 6 cards per Faction. Draw the next card; it goes to the bottom, face up. Green arrow if a condition holds, red if not. An arrow can say "flip to the other side" or "draw again" | `games/11-people-power.md` line 183, `games/09-gandhi.md` line 143 |
| Mini-deck | ABB | 5 or 6 cards per Faction. If the Command cannot run, discard and draw again. No Condition met: Pass. Then shuffle | `games/10-all-bridges-burning.md` lines 129 to 135 |

Shared rules in the Jacquard family:

- **Activation Number:** after each space, roll 1d6. A roll at or under the card's number stops the bot. Some actions skip the roll (`games/11-people-power.md` line 184, `games/04-fire-in-the-lake.md` line 153).
- **The number can change:** CL Government uses the US Alliance value (`games/02-cuba-libre.md` line 189). CW WLD adds 1 after each success (`games/13-chinas-war.md` line 177).
- **Shared tables:** one Move table and one Pieces table serve every Faction. Space Selection tables are per Faction (`games/11-people-power.md` line 178, `games/09-gandhi.md` line 139).
- **No Resources:** most card bots never gain or spend Resources (`common-system.md` line 145).
- **Event choice:** the bot plays an Event only if it is Critical (a card icon) and Effective (an Effective Events table) (`games/11-people-power.md` line 180).

All file paths above are under `docs/research/coin-analysis/`.

## Round 1: model shape (decided)

These four answers fix the shape of the schema. Recommendations are marked.

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Which deck types does the mode support? | (a) Jacquard and the ABB mini-deck, with one "deck order" setting: cycle or shuffle. (b) Jacquard only | (a): one model, one setting |
| Q2 | How does a bot card hold its logic? | (a) Each card side is a small flowchart. It reuses today's node kinds and adds two exits: "flip this card" and "draw the next card". (b) A fixed card layout: one condition box, an Operation list and a Special Activity list | (a): it reuses the editor, the dry run and the print code |
| Q3 | How does a dry run handle the Activation Number roll? | (a) The dry run lists the die results in order. With no results left, the bot goes on to the space limit. (b) The dry run gives a random seed. (c) No roll: the number is a fixed space count | (a): each result stays derivable by hand, as today |
| Q4 | Where do the shared Move and Pieces tables live? | (a) At game level, and any bot can use them. Space tables stay per bot. (b) Per bot, as today; a designer copies them | (a): it matches the printed games |

## Round 2: details (decided)

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q5 | How does a bot show that it has no Resources? | (a) A per-bot setting, "tracks Resources: yes or no". (b) Every card bot ignores Resources | (a) |
| Q6 | How does the model hold Critical and Effective Events? | (a) An optional "Critical for" faction list on each game card; "Effective" reuses today's Event rules. (b) A new per-bot Effective Events table | (a) |
| Q7 | Where does the Eligibility decision live? | (a) An ordered rule list per bot: a condition, then Pass, Event, Limited Op or Op + SA; the first row that holds wins. (b) Inside each card's flowchart | (a) |
| Q8 | How does a dry run set the bot deck's state? | (a) A dry-run patch sets the card order (top first) and the flipped cards. (b) The seed shuffles the bot deck | (a) |
| Q9 | Which Activation Number rules come first? | (a) A formula per card side and a step that skips the roll. (b) Also a number that grows after each success. (c) A fixed number only | (a) |
| Q10 | Is the bot mode per bot or per game? | (a) Per bot. (b) Per game | (a): CT uses a flowchart for the FLN only (`variation-matrix.md` line 173) |
| Q11 | What does the print kit hold for a card bot? | (a) One card sheet per card bot, both sides of each card, in place of its Non-Player sheet; shared tables print once. (b) Print waits for a later version | (a) |

## Decisions

Owner answers, 2026-11-26:

| # | Decision | Note |
|---|---|---|
| Q1 | (a) Both deck types, with one "deck order" setting: cycle or shuffle | As recommended |
| Q2 | (a) Each card side is a small flowchart with today's node kinds, plus the exits "flip this card" and "draw the next card" | As recommended |
| Q3 | (b) The dry run gives a random seed for the Activation Number rolls | Not the recommendation. A seed repeats exactly, so tests still pin the results. A person cannot derive a roll by hand. Reuse the seeded random code of `sampleDeck` in `src/deck.mjs` |
| Q4 | (a) Shared Move and Pieces tables at game level; Space Selection tables stay per bot | As recommended |
| Q5 | (a) A per-bot setting "tracks Resources"; with no, the bot ignores costs and spending limits | As recommended |
| Q6 | (a) An optional "Critical for" faction list on each game card; "Effective" reuses today's Event rules | As recommended |
| Q7 | (a) An ordered Eligibility rule list per bot; the first row that holds wins; the bot draws a card only for an Operation | As recommended |
| Q8 | (a) A dry-run patch sets the bot deck order and the flipped cards; default: as listed, none flipped. The seed is only for die rolls | As recommended |
| Q9 | (a) The Activation Number is a formula per card side (a number or a track value); a step can skip the roll. A number that grows after a success is deferred | As recommended |
| Q10 | (a) The mode is set per bot: flowchart or cards | As recommended |
| Q11 | (a) The kit prints one card sheet per card bot in place of its Non-Player sheet; shared tables print once | As recommended |

## Deferred

- An Activation Number that grows after each success (CW WLD, `games/13-chinas-war.md` line 177).
