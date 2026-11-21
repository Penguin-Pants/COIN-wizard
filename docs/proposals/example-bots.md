# Proposal: example bot design gaps (item 4)

Status: decided by the owner on 2026-11-21 (see "Decisions" at the end). Implementation follows in a separate PR.
Gaps (from `docs/ACCEPTANCE.md`, "Dry runs derived by hand"): no Harbor Strike or Four Valleys bot links a Special Activity, so the `linked-sa` cases cannot test one; bots `rh`, `du`, `vm`, `mf` and `rb` have no Event override.

Method: each result below was derived by hand from the flowchart and the board. Then a scratch copy of the examples was run through `runBot` (`src/dryrun.mjs`); every run agreed. No schema change.

## Part 1: link a Special Activity (5 bots, no rule change)

Each bot's one action node gets `linked` to its faction's Special Activity, with the Special Activity's own timing (`after`). One new table per bot.

| Bot | Linked Special Activity | Trigger | New table |
|---|---|---|---|
| `pa` | Pressure (`f1.pressure`, cost 1) | own Resources at least 1 | 1. Not at Support. 2. Any. Tie-break a: highest Pop |
| `du` | Propaganda (`f3.propaganda`, cost 1) | own Resources at least 1 | 1. Has target pieces and not at Opposition. 2. Any. Tie-break a: highest Pop |
| `ra` | Pressure (`f1.pressure`, cost 1) | own Resources at least 1 | as `pa` |
| `vm` | Fortify (`f2.fortify`, cost 2) | own Resources at least 2 | 1. Any. Tie-break a: highest Pop |
| `rb` | Raid (`f4.raid`, cost 0) | always | 1. Any. Tie-break a: most own Guerrillas |

### `linked-sa` results (card `e01`, no effect)

| Case | Patch | Expected | Reason |
|---|---|---|---|
| `pa.d5` | unchanged (dice 3, 3, 3) | operationSpecial, Canal Row, target Dockers' Union, linked `f1.pressure:space1` | Deploy as before: Canal Row, pay 2 (5 to 3), 2 Troops placed. Pressure trigger: 3 is at least 1. Legal (2+ Troops): Old Harbor, Shipyards, Canal Row. Step 1 (not at Support): Old Harbor (0), Canal Row (0). Old Harbor wins on Pop 3. |
| `du.d5` | unchanged | operationSpecial, Old Harbor, target Port Authority, linked `f3.propaganda:space2` | Campaign as before: Old Harbor, pay 1 (5 to 4), Old Harbor shifts 0 to -1. Propaganda step 1 (Port Authority pieces, opinion above -1): Shipyards (+1) only. |
| `ra.d5` | unchanged (dice 3, 3, 3) | operationSpecial, East Valley, target Mountain Front, linked `f1.pressure:space1` | Deploy as before: East Valley, pay 2 (5 to 3). Legal: Capital, High Pass, East Valley (2 Troops each). Step 1: Capital (0), East Valley (0); High Pass is at Support. Capital wins on Pop 3. |
| `vm.d5` | **changed:** 3 Valley Militia Troops in Capital (was 2) | operationSpecial, East Valley, target Mountain Front, linked `f2.fortify:space1` | Deploy as before: East Valley, pay 2 (5 to 3). Fortify needs 3+ own Troops and no Base. At setup no space has 3, so the old patch skips Fortify. With the patch, Capital (3 Troops, no Base) is the only legal space. |
| `rb.d5` | unchanged (dice 3, 3, 3) | operationSpecial, Market Town, target Republic Army, linked `f4.raid:space10` | Recruit as before: Market Town, pay 1 (5 to 4), 1 Guerrilla placed (3 there). Raid legal: River Delta (2), Market Town (3). Most Guerrillas: Market Town. Resources 4 plus 2 is 6. |

Other cases of these bots: only `outcome` can change, from `operation` to `operationSpecial`, where the Operation runs and the trigger holds. Each changed case gets its derivation in `docs/ACCEPTANCE.md` in the implementation PR.

## Part 2: `rh` and `mf` need a rule decision

- Ambush (`f2.ambush`, `f3.ambush`) accompanies Strike only, and both bots have no Strike node. So a Strike node must come first (Strike, then Recruit on `onEmpty`).
- **Limit (verified):** Ambush needs an Underground Guerrilla. Strike flips every Guerrilla in its space to Active. A dry run resolves a `during` Special Activity after the Operation's steps (`src/dryrun.mjs:120`), so Ambush can never hit the Strike space. Scratch run of `rh.d5` with 2 Troops in Tenements only: Ambush `skipped` with die 1 and with die 3.
- Ambush can hit a second space: the linked table picks from every legal space (`src/dryrun.mjs:125`). Scratch run with 2 Troops and 2 Underground Guerrillas in Tenements and in Rail Yards, dice 3, 3, 3: Strike in Tenements, then `f2.ambush:space3` (Rail Yards), operationSpecial, timing `during` unchanged. (Found by the Codex review of this PR.) The example Ambush rule does not require the Strike space (`plain`: "In one space with an Underground Guerrilla and an enemy Troops"), so this result follows the printed rule.
- `before` timing also works (scratch run: operationSpecial, linked `f2.ambush:space7`), but the validator requires the linked timing to equal the Special Activity's timing (`src/validate.mjs:297`). So Ambush's own timing must change from `during` to `before`: a game-rule change.
- With a Strike node, the other `rh` cases keep their outcome and chosen spaces; their stored `path` gains `rh.strike:empty` (scratch run of all 6 cases).

## Part 3: Event overrides for `rh`, `du`, `vm`, `mf`, `rb`

- Add one `ignore` override per bot on the card its `event-override` case uses (`e05` in Harbor Strike, `e03` in Four Valleys), with a plain reason.
- The case then tests the override: the bot skips the Event and runs its Operation (and, after Part 1, its Special Activity).
- `vm.d2`, `mf.d2` and `rb.d2` have no dice in their patch. Their enemy table ties at setup, so each patch gets dice 3, 3, 3 (as `ra.d2`). Results: as the `linked-sa` row of the same bot, without the `vm` Fortify patch (`vm.d2`: operation, East Valley, Fortify skipped).

## Decisions needed

1. Part 1 for `pa`, `du`, `ra`, `vm`, `rb`: approve or decline.
2. Part 2: change Ambush timing to `before` in both games, link Ambush with `during` (it can hit any other legal space, as the example rule allows), or leave `rh` and `mf` with no linked Special Activity (document as a model limit).
3. Part 3: `ignore` overrides as above, or another directive per bot.

## Decisions (owner, 2026-11-21)

| Part | Decision |
|---|---|
| 1. Link a Special Activity for `pa`, `du`, `ra`, `vm`, `rb` | Approved |
| 2. `rh` and `mf` | Link Ambush with `during` timing (option 1, decided after the second-space result). Add a Strike node (Strike, then Recruit if none). The `linked-sa` patch puts Troops and Underground Guerrillas in 2 spaces. No game-rule change. |
| 3. `ignore` overrides for `rh`, `du`, `vm`, `mf`, `rb` | Approved |
