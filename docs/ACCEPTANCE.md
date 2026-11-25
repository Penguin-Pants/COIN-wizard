# Acceptance: COIN Wizard, phases 0 to 12

Date: 2026-11-21. Schema: `coin-game/1.10.0` (frozen). Live tool: the "COIN Game Design Wizard" artifact.

Run the evidence: `npm test` (node tests) and `npm run test:ui` (browser tests with Playwright and system Chrome).

## Results

| Phase | Requirement (done when) | Result | Evidence |
|---|---|---|---|
| 0 | Both test commands pass; smoke run matches the pre-split baseline | Pass | `npm test`, `npm run test:ui`; smoke diff run on 2026-11-20 |
| 1 | A new user sees Not started on every step; a blocker shows next to its field | Pass | `test/ui/progress.test.mjs`, `test/ui/blockers.test.mjs` |
| 2 | No action, card or victory field needs JSON for the shipped examples | Pass | `test/ui/mechanics.test.mjs`, `test/exprmodel.test.mjs` (lossless round trip, no fallback) |
| 3 | A designer builds a full deck from empty with no JSON | Pass | `test/ui/deck.test.mjs`, `test/deck.test.mjs` |
| 4 | A bot with a flowchart, a tie-break and an Event exception passes all six dry runs, with no JSON | Pass | `test/ui/bots.test.mjs`, `test/bots.test.mjs` |
| 5 | 2, 3 and 4 factions export a complete kit | Pass | `test/ui/factioncount.test.mjs`, `test/ui/export.test.mjs`, `test/examples.test.mjs` |
| 6 | Step 1 finishes with mixed source results and every claim shows its support status | Pass | `test/ui/sources.test.mjs`, `test/sources.test.mjs`, real session below |
| 7 | A bad edit is reverted from any step without losing other work | Pass | `test/ui/recovery.test.mjs`, `test/history.test.mjs` |
| 8 | The unzipped kit prints cleanly and matches the game definition | Pass | `test/zip.test.mjs`, `test/kit.test.mjs`, `test/ui/print.test.mjs` (Letter and A4 PDFs) |
| 9 | A keyboard-only designer finishes a game at 390, 768 and 1280 px | Pass | `test/ui/a11y.test.mjs` (axe: zero violations, light and dark), `test/color.test.mjs` |
| 10 | Full games at 2, 3 and 4 factions, from empty through export | Pass | `test/ui/fullgame.test.mjs` (3 and 4 factions, clicking only, from an empty screen to the zip), `test/ui/export.test.mjs` |
| 10 | Real sources: a Wikipedia read and one inaccessible URL | Pass | Real session below |
| 10 | A rule edited in the wizard reaches every export file | Pass | `test/ui/export.test.mjs` ("a rule edited in the wizard reaches every export file"), `test/kit.test.mjs` (parity) |
| 10 | Engine import check: each example validates against the schema file alone and runs every dry run | Pass | `test/engine.test.mjs` |
| 10 | Schema frozen and documented | Pass | `docs/SCHEMA.md` ("Engine contract"), schema fingerprint in `test/engine.test.mjs` |
| 11 | One-page Non-Player sheet per bot in the GMT layout, built from the bot data, with no schema change | Pass | `src/kit.mjs` (`nonPlayerSheetHtml`), kit file `kit/<game>.<faction>.nonplayer.html`; 8 tests in `test/kit.test.mjs` ("the kit has a one-page Non-Player sheet per bot and keeps the bot aids" and 7 more); `test/ui/print.test.mjs` ("every Non-Player sheet prints on one page at Letter and A4", all 9 bots); photo check in `docs/SHEETS.md` |
| 12 | One-page Sequence of Play sheet and one-page Card and Spaces list in the GMT layout, with no schema change | Pass | `src/kit.mjs` (`sequenceHtml`, `listsHtml`), kit files `kit/<game>.sequence.html` and `kit/<game>.lists.html`; 8 tests in `test/kit.test.mjs` ("the kit has a one-page Sequence of Play sheet and a one-page Card and Spaces list" and 7 more); `test/ui/print.test.mjs` ("the Sequence of Play sheet and the Card and Spaces list print on one page each at Letter and A4", "the Sequence of Play flow keeps its columns"); photo check in `docs/SHEETS.md` |
| 13 (item 3 A) | A linked Special Activity list: the first entry that holds and finds a space runs; every layer reads the list | Pass | `test/linkedlist.test.mjs` (schema, validator, dry run, bot aid, Non-Player sheet), `test/ui/bots.test.mjs` ("a designer adds and removes an If none Special Activity") |
| 13 (item 3 E) | A card side may be a Momentum Event or a Capability: card tag, `card.lasting` in Event rules and dry runs, "Momentum, Capability" box | Pass | `test/lasting.test.mjs`, `test/ui/deck.test.mjs` ("a designer marks a card side as a Capability") |
| 13 (item 3 D) | A bot picks spaces in a scoring phase with a table; optional dry-run case `scoring`; bot aid and Non-Player sheet state it | Pass | `test/scoring.test.mjs` (values derived by hand in the test comments), `test/ui/bots.test.mjs` ("a designer adds a scoring choice") |
| 13 (item 3 C) | An Operation node with numbered parts: each part picks with its table and runs its steps; cost once per space; empty only when every part is empty; timing before with an empty check first | Pass | `test/parts.test.mjs` (values derived by hand in the test comments), `test/ui/bots.test.mjs` ("a designer splits an Operation node into parts") |
| 13 (spaceText) | A Special Activity's space tag phrase prints on the faction sheet in place of "max N spaces" | Pass | `test/spacetext.test.mjs`, `test/ui/mechanics.test.mjs` ("a designer sets a Special Activity's space tag") |
| 14 | Board step: "Fill empty fields with Claude" fills only empty fields from the read sources. Placeholder spaces and default values count as empty; spaces, pieces, track starts and eligibility the designer set are kept (owner decision, 2026-11-22) | Pass | `test/boardfill.test.mjs`, `test/ui/boardsuggest.test.mjs` |
| 15 | Priority tables can work like the GMT Non-Player sheets: `mode: sequence` takes every step in order, each as far as possible, until the limit (schema 1.7.0); new tables use it; old tables keep "first step wins". A step may have its own tie-breaks, as printed under one GMT row | Pass | `test/schema17.test.mjs` (values derived by hand in the test comments), `test/ui/bots.test.mjs` ("a designer sets a table to work in sequence") |
| 16 | Bot model gaps 2, 3, 4, 5 and 10 from the FARC sheet research (schema 1.8.0): `card.position`, `turn.position`, `canPlace`, `canDo` and a per-step `target`. The editor offers "Can place", "Can do", the 2 variables and a Target select on each step of a space table | Pass | `test/schema18.test.mjs`, `test/ui/bots.test.mjs` ("a designer sets a step's target and uses Can place in its filter") |
| 17 | Gap 7 (schema 1.9.0): `scoring.nextFinal` for "Unless next Propaganda final". A dry run can set it, and the 1.8.0 turn position, in the editor | Pass | `test/schema19.test.mjs`, `test/ui/bots.test.mjs` ("a dry run sets 2nd Eligible and a final next scoring card") |
| 18 | Gap 6 (schema 1.9.0): a game has 3 or 5 opinion levels (owner decision, 2026-11-25: "some games use 3 levels, others use 5"). The board step sets it; starting opinion, `shift`, dry runs, the AI board helper and the print kit follow it; preset victory rules count Active spaces twice | Pass | `test/schema19.test.mjs`, `test/ui/opinion.test.mjs` |
| 19 | Gap 9 (schema 1.9.0): an opponent-table step may target an enemy piece type; the bot picks its owner and runs only the option for that piece (owner decisions, 2026-11-25: every piece has an owner; only that piece type). The editor offers a Piece select on opponent steps and on enemy options | Pass | `test/schema19.test.mjs`, `test/ui/bots.test.mjs` ("a designer sets an opponent step to a piece target and clears it"), `test/ui/anyenemy.test.mjs` ("an enemy option can be set to one piece type of that enemy") |
| 21 | Gap 11 (schema 1.10.0): an Event exception may hold a node. The bot runs the card side it plays, with the node's table for the spaces and an optional enemy table for the target (owner decisions, 2026-11-25). The dry run runs it, then follows "yes". The editor offers "Run the Event with table" and "Target enemy with table"; the Non-Player sheet and the aid print the table label after the text | Pass | `test/schema110.test.mjs`, `test/ui/bots.test.mjs` ("a designer runs an Event exception with a table and clears it") |
| 20 | Gap 8 (schema 1.9.0): a move step can activate the moved pieces when a condition holds at the destination (`move.count`), and `unmoved` counts pieces not yet moved in the Operation (owner answers 2026-11-25, Q3 and Q4). The editor adds "Activate the moved pieces" to move steps and "Pieces not yet moved" as a value | Pass | `test/schema19.test.mjs`, `test/ui/movement.test.mjs` |
| Core | Every part works for 3 and 4 factions: per-faction and rival values, bots that pick their enemy, templates that target a chosen enemy, unique bot codes | Pass | `test/nfaction.test.mjs`, `test/ui/fullgame.test.mjs`, examples `harbor-strike` and `four-valleys` (every bot picks its enemy; one dry run shows the enemy change with the board) |

## Real-source session (2026-11-21)

Claude in chat read the sources, as the wizard's handoff asks.

| Source | URL | Result |
|---|---|---|
| Wikipedia | https://en.wikipedia.org/wiki/Irish_War_of_Independence | Received. Characters 0 to 100,000 of 189,438 were read. The start (21 January 1919, Soloheadbeg Ambush) and the truce of 11 July 1921 agree with the Tan War brief. |
| Journal article | https://www.jstor.org/stable/30008223 | Failed. The page is a JavaScript client challenge, not the article. |

The wizard side of this session (one source received, one failed with Retry, the others still usable) is covered by `test/ui/sources.test.mjs`.

## Known issues

Status of each gap from the 2026-11-21 review (branch `fix/known-gaps`). "Gap" is the review's number; "Known issue" is the number this list used before. Closed means fixed in code with a test. Accepted means a platform limit. Open means it waits for a named human action (see "Human checklist").

| Gap | Known issue | Gap text | Status | Evidence |
|---|---|---|---|---|
| 1 | 1 | Dry runs did not change the board between an Operation and its linked Special Activity | Closed | `src/effects.mjs:205` (`applyAction`), `src/dryrun.mjs:120`; tests "a linked Special Activity sees the board after its Operation" (`test/bots.test.mjs`), `test/effects.test.mjs`; Tan War dry run `cw.d7` |
| 2 | 2 | No example uses `markerSet` | Closed | `examples/tan-war.game.json` (`crown.martial-law` sets `curfew`); `src/state.mjs:8` (markers start from setup), `src/kit.mjs:148` (`spaceMarkers`: counters and component list); test "Tan War Martial Law sets a Curfew marker that starts from setup" (`test/effects.test.mjs`) |
| 3 | 6 | 3- and 4-faction dry runs store run results as expected | Closed | Every case derived by hand: "Dry runs derived by hand" below; `test/engine.test.mjs` checks each one. The 2 design gaps (no linked Special Activity; 5 bots with no Event override) were closed by item 4 (see below). |
| 4 | none | No bundle size limit | Closed | `scripts/build.mjs:9` (`LIMIT_KIB = 700`; the build exits 1 above it and writes no page); tests "the build fails with a clear message above the size limit" and "the build passes under the default limit of 700 KiB" (`test/build.test.mjs`). Size now: 570 KiB. |
| 5 | none | Built page not tied to a commit | Closed | `scripts/build.mjs:17` (short commit, `-dirty` for local changes) and `ui/index.template.html:139` (`#about`, under the step list: "Build <commit>, schema coin-game/1.10.0"); test "the built page names its commit and schema version" (`test/build.test.mjs`); `Makefile` targets `test`, `test-ui`, `build`, `publish-check`; publish step in `README.md` ("Publish"). |
| 6 | 3 | Faction aid not compared with a printed GMT sheet | Closed | Compared with 5 of the 9 sheets in `examples/player-faction-sheets/` (Andean Abyss Government and Cartels, A Distant Plain Taliban and Warlords, Colonial Twilight FLN); see `docs/SHEETS.md`. `src/kit.mjs` (`factionAidHtml`): front page with an Operations column and a Special Activities column of boxes (Purpose, Accompanying Op, Location, Cost, Procedure; "+ ... ?" pairing tag; "max N space"; rule section), then a Victory box for every faction with this faction's row marked. Back page: forces, sequence of play, scoring. Fields from schema 1.4.0. Tests: "the faction sheet front has an Operations column, a Special Activities column and a Victory box" and 6 more in `test/kit.test.mjs`; `test/ui/print.test.mjs` (2 pages at Letter and A4). |
| 7 | 4 | Print checked by PDF only, not on paper | Open: needs a person (checklist item P1) | Code part closed: `src/kit.mjs:132` (`printTestHtml`), kit file `kit/<game>.print-test.html`; tests "the kit has a print test sheet with a 50 mm ruler, a card and a counter at true size" (`test/kit.test.mjs`) and "the print test sheet is one page at Letter and A4 with true-size ruler, card and counter" (`test/ui/print.test.mjs`). |
| 8 | 5 | Claim checks tested with scripted answers only | Open: needs a person (checklist item P2) | Manual test script below ("Manual test: claim check in the live artifact"). Scripted coverage: `test/ui/sources.test.mjs`, `test/sources.test.mjs`. |
| 9 | 7 | Live URL fetch blocked by the page's content security policy | Accepted: platform limit | See "Platform limits" below. |
| 10 | none | `main` is not protected | Open: needs a person (checklist item P3) | `gh api -X PUT repos/Penguin-Pants/COIN-wizard/branches/main/protection` was refused on 2026-11-21: HTTP 403, "Write access to this GitHub API path is not permitted through this proxy." |

Gap 1 (dry runs) changed four stored Tan War results. Each new value was derived by hand from the rules before the run:

| Case | Before | After | Why |
|---|---|---|---|
| `cw.d3` | Operation, Martial Law skipped | Operation plus Martial Law in Cork City | Garrison places 2 Army in Cork City (1 to 3). Cork City is then legal (2 or more Army, Neutral) and wins CW-4 step 1 (Pop 2, Neutral). Resources 8, minus 2, is 6: the trigger (3 or more) holds. |
| `cw.d4` | Operation, Martial Law skipped | Operation plus Martial Law in Belfast | Garrison places 2 Army in Belfast (patched to Neutral). Belfast: 3 Army, Pop 2, Neutral: step 1. |
| `ib.d4` | Operation, Boycott skipped | Operation plus Boycott in Cork City | March moves all 3 Volunteers from County Cork into Cork City (count `any`). No Crown cubes (cleared), so they stay Underground. Cork City: 3 Underground, Pop 2, Neutral: IB-4 step 1. Resources 3, minus 1, is 2: the trigger (2 or more) holds. |
| `ib.d5` | No die in the patch | Die 3 added; result unchanged (Boycott in Kerry) | Attack rolls a die. 3 is at or below the 3 Volunteers in County Cork: 1 Police is removed (no Army there), then all Volunteers flip to Active. Kerry (2 Underground, Neutral) is the only legal Boycott space. |

Past Tan War files (`test/fixtures/`) keep the old results. After migration they flag these four cases and nothing else (`test/migrate.test.mjs`).


Earlier: closed on 2026-11-21 (3 and 4 factions are a core requirement): `other.resources` replaced by per-faction and rival values; bots pick their enemy with opponent tables; templates target a chosen enemy; a click-through test builds 3- and 4-faction games from empty.


### Follow-up: dry-run effects

Codex reviewed PR 1 eight times and found 18 edge cases in `src/effects.mjs` and `src/dryrun.mjs`. 16 were fixed in PR 1, each with a test. The last 2 are closed in the follow-up PR:

| Item | Status | Evidence |
|---|---|---|
| 1. A before-timed Special Activity can make the Operation's chosen spaces illegal | Closed. Rule chosen by the owner: drop those spaces from `chosen` and refund their cost; if none stay, the Operation changes nothing | `src/dryrun.mjs:136` (after a `before` Special Activity), `src/effects.mjs:181` (`refundCost`); test "a before-timed Special Activity that makes a chosen space illegal drops it and refunds its cost" (`test/bots.test.mjs`); rule in `docs/SCHEMA.md` |
| 2. `place` with count `moved` did not use up the moved count | Closed | `src/effects.mjs:87` (`place`); test "place with count moved places each moved piece once" (`test/effects.test.mjs`) |

## Platform limits

1. Live URL fetch from the artifact page is blocked by its content security policy (high confidence, from the platform guide; was known issue 7). This is a platform limit, not a defect. **The supported intake path is the chat handoff:** step 1 shows "Ask Claude in chat to read pending sources"; Claude in chat reads the URLs and returns the text, or the designer pastes the text with "Paste text for this source". The real-source session above used this path.

## Human checklist

These items need a person. They are not done until a person records the result here.

- [ ] **P1 Print on paper (gap 7).** Export the Tan War kit. Print `kit/tan-war.print-test.html` at 100 % scale ("Actual size") on Letter and on A4. Measure the ruler (should be 50 mm). Cut the card (63 x 88 mm) and the counter (15 x 15 mm). Write the measured sizes in the table on the sheet and report them here.
- [ ] **P2 Live claim check (gap 8).** Run "Manual test: claim check in the live artifact" below and fill in its table.
- [ ] **P3 Protect `main` (gap 10).** GitHub: repository Settings, Branches (or Rules, Rulesets), add a rule for `main`: require a pull request before merging; require the status check `test` to pass; require branches to be up to date. Save.

Gap 6 (faction aid) needed an image of a printed GMT faction aid. The user supplied the Colonial Twilight FLN sheet; no human item is left for it.

## Dry runs derived by hand (Harbor Strike, Four Valleys)

The schema has no description field on a dry run, so the reasons are here. Each result was derived from the flowchart and the board before the run; the run then agreed.

Board facts used. Harbor Strike: margins at setup are Port Authority -6, Red Hand -7, Dockers' Union -7; both rebel enemies hold 4 pieces. Four Valleys: margins are Republic Army -7, Valley Militia -7, Mountain Front -6, River Brigades -6; each faction holds 4 pieces. An enemy tie that survives both tie-breaks goes to the die in name order (2 items: die 1 to 3 picks the first).

Unless a line says so, cases use card `e01` (no effect), so the Event is not played.

### Harbor Strike

| Case | Expected | Reason |
|---|---|---|
| `pa.d1` ineligible | none | Port Authority is not Eligible. |
| `pa.d2` event-override | operationSpecial, Canal Row, target Dockers' Union, linked Pressure in Old Harbor | Card e05 has the override `ignore`. Deploy as `pa.d5`. **Item 4:** Pressure follows, as in `pa.d5`. |
| `pa.d3` no-target | pass | Resources 0: Deploy (cost 2) has no legal space. |
| `pa.d4` tie | operationSpecial, Canal Row, target Dockers' Union, linked Pressure in Old Harbor | Shipyards and Rail Yards set to Neutral: all margins -8, the enemy tie and the space tie both go to the die (3, 3). **Item 4:** Pressure step 1 (not at Support): Old Harbor, Shipyards, Canal Row; Old Harbor wins on Pop 3. |
| `pa.d5` linked-sa | operationSpecial, Canal Row, target Dockers' Union, linked Pressure in Old Harbor | **Item 4.** Deploy in Canal Row, pay 2 (5 to 3). Pressure (Resources 3, at least 1): legal Old Harbor, Shipyards, Canal Row (2+ Troops). Step 1, not at Support: Old Harbor, Canal Row. Old Harbor wins on Pop 3. |
| `pa.d6` fallback | pass | **Changed.** Resources 1: below the Deploy cost of 2, so the action node falls back to Pass. |
| `rh.d1` ineligible | none | Red Hand is not Eligible. |
| `rh.d2` event-override | operation, Tenements, target Port Authority | **Item 4.** Card e05 has the override `ignore`. Strike: no space holds Red Hand Guerrillas and Port Authority Troops (`rh.strike:empty`). Recruit as `rh.d5` before item 4: Tenements (Pop 2) beats Rail Yards. |
| `rh.d3` no-target | pass | Resources 0: Recruit (cost 1) has no legal space. **Item 4:** the path gains `rh.strike:empty` (no space holds own Guerrillas and enemy Troops). |
| `rh.d4` tie | operation, Customs Quay, target Port Authority | **Changed.** 1 Guerrilla added in Customs Quay. Enemy: the only state faction. RH-1 step 2: Customs Quay and Tenements tie at Pop 2; die 1 picks Customs Quay. The old patch had no tie (Tenements won on Pop). **Item 4:** the path gains `rh.strike:empty` (no space holds own Guerrillas and enemy Troops). |
| `rh.d5` linked-sa | operationSpecial, Tenements, linked Ambush in Rail Yards | **Item 4.** Patch: 2 Troops in Tenements and in Rail Yards; dice 3, 3, 3. Strike is legal in both; Tenements wins on Pop 2. Roll 3 is above 2 Guerrillas: no Troops removed; the Guerrillas flip Active. Ambush (`during`, Resources 5): Tenements has no Underground Guerrilla now, so Rail Yards is the only legal space. |
| `rh.d6` fallback | pass | **Changed.** No Red Hand pieces on the map: Recruit has no legal space. **Item 4:** the path gains `rh.strike:empty` (no space holds own Guerrillas and enemy Troops). |
| `du.d1` ineligible | none | Dockers' Union is not Eligible. |
| `du.d2` event-override | operationSpecial, Old Harbor, target Port Authority, linked Propaganda in Shipyards | **Item 4.** Card e05 has the override `ignore`. As `du.d5`. |
| `du.d3` no-target | pass | Resources 0: Campaign (cost 1) has no legal space. |
| `du.d4` tie | operationSpecial, Tenements, target Port Authority, linked Propaganda in Shipyards | Troops leave Old Harbor and 1 Troops goes to Tenements. DU-1 step 1: Shipyards and Tenements tie at Pop 2; die 6 picks Tenements. **Item 4:** Campaign shifts Tenements to -1; Propaganda step 1 (Port Authority pieces, opinion above -1): Shipyards only. |
| `du.d5` linked-sa | operationSpecial, Old Harbor, target Port Authority, linked Propaganda in Shipyards | **Item 4.** Campaign in Old Harbor (Pop 3), pay 1 (5 to 4); Old Harbor shifts 0 to -1. Propaganda step 1: Shipyards (+1) only. |
| `du.d6` fallback | pass | **Changed.** Resources 0. Campaign is legal everywhere, so this is the only way to fall back; the case repeats `du.d3`. |

### Four Valleys

| Case | Expected | Reason |
|---|---|---|
| `ra.d1` ineligible | none | Republic Army is not Eligible. |
| `ra.d2` event-override | operationSpecial, East Valley, target Mountain Front, linked Pressure in Capital | Card e03 has the override `ignore`. Enemy tie to the die (3). **Item 4:** Pressure as `ra.d5`. |
| `ra.d3` no-target | pass | Resources 0: Deploy (cost 2) has no legal space. |
| `ra.d4` tie | operationSpecial, East Valley, target Mountain Front, linked Pressure in Capital | High Pass and North Valley to Neutral: rebel margins -8, still tied; die 3. **Item 4:** Pressure step 1: Capital, High Pass, East Valley; Capital wins on Pop 3. |
| `ra.d5` linked-sa | operationSpecial, East Valley, target Mountain Front, linked Pressure in Capital | **Item 4.** Deploy in East Valley, pay 2 (5 to 3). Pressure legal: Capital, High Pass, East Valley. Step 1: Capital, East Valley (High Pass is at Support). Capital wins on Pop 3. |
| `ra.d6` fallback | pass | **Changed.** Resources 1: below the Deploy cost of 2. |
| `vm.d1` ineligible | none | Valley Militia is not Eligible. |
| `vm.d2` event-override | operation, East Valley, target Mountain Front, Fortify skipped | **Item 4.** Card e03 has the override `ignore`; dice 3, 3, 3 added (the enemy table ties). Deploy as `vm.d5`. Fortify needs 3+ own Troops: no space has them. |
| `vm.d3` no-target | pass | Resources 0. |
| `vm.d4` tie | operation, East Valley, target Mountain Front, Fortify skipped | As `ra.d4`: enemy tie to the die. **Item 4:** no space has 3 Valley Militia Troops, so Fortify is skipped. |
| `vm.d5` linked-sa | operationSpecial, East Valley, target Mountain Front, linked Fortify in Capital | **Item 4.** Patch: 3 Valley Militia Troops in Capital. Deploy in East Valley, pay 2 (5 to 3). Fortify (Resources 3, at least 2): Capital is the only space with 3+ Troops and no Base. |
| `vm.d6` fallback | pass | **Changed.** Resources 1: below the Deploy cost of 2. |
| `mf.d1` ineligible | none | Mountain Front is not Eligible. |
| `mf.d2` event-override | operation, East Valley, target Republic Army | **Item 4.** Card e03 has the override `ignore`; dice 3, 3, 3 added. Strike: no space holds Mountain Front Guerrillas and Republic Army Troops (`mf.strike:empty`). Recruit: enemy tie to the die (3) picks Republic Army; East Valley wins on Pop. |
| `mf.d3` no-target | pass | Resources 0. **Item 4:** the path gains `mf.strike:empty` (no space holds own Guerrillas and enemy Troops). |
| `mf.d4` tie | operation, East Valley, target Republic Army | Enemy: Republic Army and Valley Militia tie (-8, 4 pieces); die 3 picks Republic Army. Recruit is legal in East Valley and South Ridge; no Republic Army there; East Valley has the higher Pop. **Item 4:** the path gains `mf.strike:empty` (no space holds own Guerrillas and enemy Troops). |
| `mf.d5` linked-sa | operationSpecial, East Valley, linked Ambush in South Ridge | **Item 4.** Patch: 2 Republic Army Troops in East Valley and in South Ridge. Strike: East Valley (Pop 2) beats South Ridge. Roll 3 is above 2 Guerrillas: no Troops removed; the Guerrillas flip Active. Ambush: South Ridge is the only legal space. |
| `mf.d6` fallback | pass | **Changed.** No Mountain Front pieces on the map: Recruit has no legal space. **Item 4:** the path gains `mf.strike:empty` (no space holds own Guerrillas and enemy Troops). |
| `mf.switch` tie | operation, East Valley, target Valley Militia | 3 Valley Militia Troops added in Dam: the margin tie stays, tie-break b (most pieces, 7 to 4) picks Valley Militia. **Item 4:** the path gains `mf.strike:empty` (no space holds own Guerrillas and enemy Troops). |
| `rb.d1` ineligible | none | River Brigades is not Eligible. |
| `rb.d2` event-override | operationSpecial, Market Town, target Republic Army, linked Raid in Market Town | **Item 4.** Card e03 has the override `ignore`; dice 3, 3, 3 added. As `rb.d5`. |
| `rb.d3` no-target | pass | Resources 0. |
| `rb.d4` tie | operationSpecial, Market Town, target Republic Army, linked Raid in Market Town | Enemy tie to the die (3). Recruit is legal in River Delta and Market Town, both Pop 2: die 3 picks Market Town (first by name). **Item 4:** Raid: Market Town (3 Guerrillas) beats River Delta (2). |
| `rb.d5` linked-sa | operationSpecial, Market Town, target Republic Army, linked Raid in Market Town | **Item 4.** Recruit in Market Town, pay 1 (5 to 4), 1 Guerrilla placed (3 there). Raid: Market Town beats River Delta (2) on Guerrillas. Resources 4 plus 2 is 6. |
| `rb.d6` fallback | pass | **Changed.** No River Brigades pieces on the map: Recruit has no legal space. |

Differences found: no stored result was wrong for its patch. 9 cases did not test their label and got new patches (the 7 `fallback` cases, `rh.d4`, `du.d4`). Design gaps left open (need a designer): the 7 bots link no Special Activity, so their `linked-sa` cases cannot test one; 5 bots (`rh`, `du`, `vm`, `mf`, `rb`) have no Event override, so their `event-override` cases test `playIf` only.

Item 4 (2026-11-21, `docs/proposals/example-bots.md`): the 2 design gaps are closed. Every bot links a Special Activity and its `linked-sa` case runs it; every bot has an Event override and its `event-override` case uses it. Rows marked **Item 4** changed; each was derived by hand, then the run agreed. Tests: "every linked-sa case runs a linked Special Activity" and "every event-override case uses an override of its bot" (`test/examples.test.mjs`).

## Manual test: claim check in the live artifact

Run time: about 10 minutes. Tester: a person with access to the "COIN Game Design Wizard" artifact.

1. Open the live artifact. Start a new game. Stay on step 1 (Brief).
2. Under "Sources", click "Add source" two times. Enter these URLs:
   - Source 1: `https://en.wikipedia.org/wiki/Irish_War_of_Independence`
   - Source 2: `https://en.wikipedia.org/wiki/Anglo-Irish_Treaty`
3. Make both sources "read": copy the text from "Ask Claude in chat to read pending sources" into a Claude chat, or open "Paste text for this source" and paste the article text, then click "Use pasted text".
4. Under "Claims", click "Add claim" two times:
   - True claim, sources `s1`: "The truce that ended the fighting began on 11 July 1921."
   - False claim, sources `s1`: "The war ended with a truce in March 1925."
5. Click "Check" on each claim. Wait for the verdict chip.
6. Record the result in the table. Pass: the true claim shows `supported` and the false claim shows `unsupported` (`partial` on the false claim is a fail). Each verdict shows a reason and a passage (source id and characters).

| Date | Tester | Claim | Verdict | Reason shown | Passage shown | Pass or fail |
|---|---|---|---|---|---|---|
| | | True (truce 11 July 1921) | | | | |
| | | False (truce March 1925) | | | | |

