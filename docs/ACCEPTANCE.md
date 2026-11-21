# Acceptance: COIN Wizard, phases 0 to 10

Date: 2026-11-21. Schema: `coin-game/1.3.0` (frozen). Live tool: the "COIN Game Design Wizard" artifact.

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
| Core | Every part works for 3 and 4 factions: per-faction and rival values, bots that pick their enemy, templates that target a chosen enemy, unique bot codes | Pass | `test/nfaction.test.mjs`, `test/ui/fullgame.test.mjs`, examples `harbor-strike` and `four-valleys` (every bot picks its enemy; one dry run shows the enemy change with the board) |

## Real-source session (2026-11-21)

Claude in chat read the sources, as the wizard's handoff asks.

| Source | URL | Result |
|---|---|---|
| Wikipedia | https://en.wikipedia.org/wiki/Irish_War_of_Independence | Received. Characters 0 to 100,000 of 189,438 were read. The start (21 January 1919, Soloheadbeg Ambush) and the truce of 11 July 1921 agree with the Tan War brief. |
| Journal article | https://www.jstor.org/stable/30008223 | Failed. The page is a JavaScript client challenge, not the article. |

The wizard side of this session (one source received, one failed with Retry, the others still usable) is covered by `test/ui/sources.test.mjs`.

## Known issues

Status of each gap from the 2026-11-21 review (branch `fix/known-gaps`). Closed means fixed in code with a test. Open means it waits for a named human action (see "Human checklist").

| # | Gap | Status | Evidence |
|---|---|---|---|
| 1 | Dry runs did not change the board between an Operation and its linked Special Activity | Closed | `src/effects.mjs:149` (`applyAction`), `src/dryrun.mjs:114`; tests "a linked Special Activity sees the board after its Operation" (`test/bots.test.mjs`), `test/effects.test.mjs`; Tan War dry run `cw.d7` |
| 2 | No example uses `markerSet` | Closed | `examples/tan-war.game.json` (`crown.martial-law` sets `curfew`); `src/state.mjs:8` (markers start from setup), `src/kit.mjs:132` (`spaceMarkers`: counters and component list); test "Tan War Martial Law sets a Curfew marker that starts from setup" (`test/effects.test.mjs`) |
| 3 | Faction aid not compared with a printed GMT sheet | Open | |
| 4 | Print checked by PDF only, not on paper | Open | |
| 5 | Claim checks tested with scripted answers only | Open | |
| 6 | 3- and 4-faction dry runs store run results as expected | Closed (2 design gaps open) | Every case derived by hand: "Dry runs derived by hand" below; `test/engine.test.mjs` checks each one. Open: no bot in these examples links a Special Activity, and 5 bots have no Event override (see below). |
| 8 | No bundle size limit | Open | |
| 9 | Built page not tied to a commit | Open | |
| 10 | `main` is not protected | Open | |

Gap 1 changed four stored Tan War results. Each new value was derived by hand from the rules before the run:

| Case | Before | After | Why |
|---|---|---|---|
| `cw.d3` | Operation, Martial Law skipped | Operation plus Martial Law in Cork City | Garrison places 2 Army in Cork City (1 to 3). Cork City is then legal (2 or more Army, Neutral) and wins CW-4 step 1 (Pop 2, Neutral). Resources 8, minus 2, is 6: the trigger (3 or more) holds. |
| `cw.d4` | Operation, Martial Law skipped | Operation plus Martial Law in Belfast | Garrison places 2 Army in Belfast (patched to Neutral). Belfast: 3 Army, Pop 2, Neutral: step 1. |
| `ib.d4` | Operation, Boycott skipped | Operation plus Boycott in Cork City | March moves all 3 Volunteers from County Cork into Cork City (count `any`). No Crown cubes (cleared), so they stay Underground. Cork City: 3 Underground, Pop 2, Neutral: IB-4 step 1. Resources 3, minus 1, is 2: the trigger (2 or more) holds. |
| `ib.d5` | No die in the patch | Die 3 added; result unchanged (Boycott in Kerry) | Attack rolls a die. 3 is at or below the 3 Volunteers in County Cork: 1 Police is removed (no Army there), then all Volunteers flip to Active. Kerry (2 Underground, Neutral) is the only legal Boycott space. |

Past Tan War files (`test/fixtures/`) keep the old results. After migration they flag these four cases and nothing else (`test/migrate.test.mjs`).

## Dry runs derived by hand (Harbor Strike, Four Valleys)

The schema has no description field on a dry run, so the reasons are here. Each result was derived from the flowchart and the board before the run; the run then agreed.

Board facts used. Harbor Strike: margins at setup are Port Authority -6, Red Hand -7, Dockers' Union -7; both rebel enemies hold 4 pieces. Four Valleys: margins are Republic Army -7, Valley Militia -7, Mountain Front -6, River Brigades -6; each faction holds 4 pieces. An enemy tie that survives both tie-breaks goes to the die in name order (2 items: die 1 to 3 picks the first).

Unless a line says so, cases use card `e01` (no effect), so the Event is not played.

### Harbor Strike

| Case | Expected | Reason |
|---|---|---|
| `pa.d1` ineligible | none | Port Authority is not Eligible. |
| `pa.d2` event-override | operation, Canal Row, target Dockers' Union | Card e05 has the override `ignore`. Enemy: Red Hand and Dockers' Union tie (-7, 4 pieces); die 3 picks Dockers' Union. PA-1 step 1: Fish Market and Canal Row (Pop 1); die 3 picks Canal Row. |
| `pa.d3` no-target | pass | Resources 0: Deploy (cost 2) has no legal space. |
| `pa.d4` tie | operation, Canal Row, target Dockers' Union | Shipyards and Rail Yards set to Neutral: all margins -8, the enemy tie and the space tie both go to the die (3, 3). |
| `pa.d5` linked-sa | operation, Canal Row, target Dockers' Union | Same as setup. The bot has no linked Special Activity, so the case cannot test one (design gap). |
| `pa.d6` fallback | pass | **Changed.** Resources 1: below the Deploy cost of 2, so the action node falls back to Pass. |
| `rh.d1` ineligible | none | Red Hand is not Eligible. |
| `rh.d2` event-override | event, unshaded | Card e05 has an effect; the bot has no override, so `playIf` plays it (design gap: no override to test). |
| `rh.d3` no-target | pass | Resources 0: Recruit (cost 1) has no legal space. |
| `rh.d4` tie | operation, Customs Quay, target Port Authority | **Changed.** 1 Guerrilla added in Customs Quay. Enemy: the only state faction. RH-1 step 2: Customs Quay and Tenements tie at Pop 2; die 1 picks Customs Quay. The old patch had no tie (Tenements won on Pop). |
| `rh.d5` linked-sa | operation, Tenements, target Port Authority | Recruit is legal in Rail Yards and Tenements; neither holds Port Authority pieces; Tenements has the higher Pop. No linked Special Activity (design gap). |
| `rh.d6` fallback | pass | **Changed.** No Red Hand pieces on the map: Recruit has no legal space. |
| `du.d1` ineligible | none | Dockers' Union is not Eligible. |
| `du.d2` event-override | event, unshaded | No override in this bot; `playIf` plays the card (design gap). |
| `du.d3` no-target | pass | Resources 0: Campaign (cost 1) has no legal space. |
| `du.d4` tie | operation, Tenements, target Port Authority | **Changed.** Troops leave Old Harbor and 1 Troops goes to Tenements. DU-1 step 1: Shipyards and Tenements tie at Pop 2; die 6 picks Tenements. The old patch had no tie (Old Harbor won on Pop 3). |
| `du.d5` linked-sa | operation, Old Harbor, target Port Authority | DU-1 step 1: Old Harbor (Pop 3) beats Shipyards (Pop 2). No linked Special Activity (design gap). |
| `du.d6` fallback | pass | **Changed.** Resources 0. Campaign is legal everywhere, so this is the only way to fall back; the case repeats `du.d3`. |

### Four Valleys

| Case | Expected | Reason |
|---|---|---|
| `ra.d1` ineligible | none | Republic Army is not Eligible. |
| `ra.d2` event-override | operation, East Valley, target Mountain Front | Card e03 has the override `ignore`. Enemy: Mountain Front and River Brigades tie (-6, 4 pieces); die 3 picks Mountain Front. RA-1 step 1: East Valley (Pop 2) beats South Ridge (Pop 1). |
| `ra.d3` no-target | pass | Resources 0: Deploy (cost 2) has no legal space. |
| `ra.d4` tie | operation, East Valley, target Mountain Front | High Pass and North Valley to Neutral: rebel margins -8, still tied; die 3. |
| `ra.d5` linked-sa | operation, East Valley, target Mountain Front | Same as setup. No linked Special Activity (design gap). |
| `ra.d6` fallback | pass | **Changed.** Resources 1: below the Deploy cost of 2. |
| `vm.d1` ineligible | none | Valley Militia is not Eligible. |
| `vm.d2` event-override | event, unshaded | No override in this bot; `playIf` plays e03 (design gap). |
| `vm.d3` no-target | pass | Resources 0. |
| `vm.d4` tie | operation, East Valley, target Mountain Front | As `ra.d4`: enemy tie to the die. |
| `vm.d5` linked-sa | operation, East Valley, target Mountain Front | As `ra.d5`. No linked Special Activity (design gap). |
| `vm.d6` fallback | pass | **Changed.** Resources 1: below the Deploy cost of 2. |
| `mf.d1` ineligible | none | Mountain Front is not Eligible. |
| `mf.d2` event-override | event, unshaded | No override in this bot (design gap). |
| `mf.d3` no-target | pass | Resources 0. |
| `mf.d4` tie | operation, East Valley, target Republic Army | Enemy: Republic Army and Valley Militia tie (-8, 4 pieces); die 3 picks Republic Army. Recruit is legal in East Valley and South Ridge; no Republic Army there; East Valley has the higher Pop. |
| `mf.d5` linked-sa | operation, East Valley, target Republic Army | Same as setup (margins -7, tie to the die). No linked Special Activity (design gap). |
| `mf.d6` fallback | pass | **Changed.** No Mountain Front pieces on the map: Recruit has no legal space. |
| `mf.switch` tie | operation, East Valley, target Valley Militia | 3 Valley Militia Troops added in Dam: the margin tie stays, tie-break b (most pieces, 7 to 4) picks Valley Militia. |
| `rb.d1` ineligible | none | River Brigades is not Eligible. |
| `rb.d2` event-override | event, unshaded | No override in this bot (design gap). |
| `rb.d3` no-target | pass | Resources 0. |
| `rb.d4` tie | operation, Market Town, target Republic Army | Enemy tie to the die (3). Recruit is legal in River Delta and Market Town, both Pop 2: die 3 picks Market Town (first by name). |
| `rb.d5` linked-sa | operation, Market Town, target Republic Army | Same as setup. No linked Special Activity (design gap). |
| `rb.d6` fallback | pass | **Changed.** No River Brigades pieces on the map: Recruit has no legal space. |

Differences found: no stored result was wrong for its patch. 9 cases did not test their label and got new patches (the 7 `fallback` cases, `rh.d4`, `du.d4`). Design gaps left open (need a designer): the 7 bots link no Special Activity, so their `linked-sa` cases cannot test one; 5 bots (`rh`, `du`, `vm`, `mf`, `rb`) have no Event override, so their `event-override` cases test `playIf` only.
