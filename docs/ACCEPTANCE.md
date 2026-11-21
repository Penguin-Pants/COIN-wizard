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

Status of each gap from the 2026-11-21 review (branch `fix/known-gaps`). "Gap" is the review's number; "Known issue" is the number this list used before. Closed means fixed in code with a test. Accepted means a platform limit. Open means it waits for a named human action (see "Human checklist").

| Gap | Known issue | Gap text | Status | Evidence |
|---|---|---|---|---|
| 1 | 1 | Dry runs did not change the board between an Operation and its linked Special Activity | Closed | `src/effects.mjs:194` (`applyAction`), `src/dryrun.mjs:120`; tests "a linked Special Activity sees the board after its Operation" (`test/bots.test.mjs`), `test/effects.test.mjs`; Tan War dry run `cw.d7` |
| 2 | 2 | No example uses `markerSet` | Closed | `examples/tan-war.game.json` (`crown.martial-law` sets `curfew`); `src/state.mjs:8` (markers start from setup), `src/kit.mjs:148` (`spaceMarkers`: counters and component list); test "Tan War Martial Law sets a Curfew marker that starts from setup" (`test/effects.test.mjs`) |
| 3 | 6 | 3- and 4-faction dry runs store run results as expected | Closed (2 design gaps open) | Every case derived by hand: "Dry runs derived by hand" below; `test/engine.test.mjs` checks each one. Open: no bot in these examples links a Special Activity, and 5 bots have no Event override (see below). |
| 4 | none | No bundle size limit | Closed | `scripts/build.mjs:9` (`LIMIT_KIB = 700`; the build exits 1 above it and writes no page); tests "the build fails with a clear message above the size limit" and "the build passes under the default limit of 700 KiB" (`test/build.test.mjs`). Size now: 570 KiB. |
| 5 | none | Built page not tied to a commit | Closed | `scripts/build.mjs:17` (short commit, `-dirty` for local changes) and `ui/index.template.html:139` (`#about`, under the step list: "Build <commit>, schema coin-game/1.3.0"); test "the built page names its commit and schema version" (`test/build.test.mjs`); `Makefile` targets `test`, `test-ui`, `build`, `publish-check`; publish step in `README.md` ("Publish"). |
| 6 | 3 | Faction aid not compared with a printed GMT sheet | Closed (partial match, see note) | Compared with `examples/non-player-bot-sheets/Colonial_Twilight_FLN_Faction_Sheet.jpg` (on `main`). `src/kit.mjs:166` (`factionAidHtml`): Operations, Special Activities, then Victory for every faction; each action reads Location, Cost, Procedure. Test "the faction aid follows the section order of a printed GMT faction aid" (`test/kit.test.mjs`). Not matched (needs schema fields, so not done): Purpose line, accompanying Op or Special Activity, rule number per action, max spaces per Special Activity. The FLN image shows one side only; Forces, Sequence of play and scoring follow Victory. |
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
| 1. A before-timed Special Activity can make the Operation's chosen spaces illegal | Closed. Rule chosen by the owner: drop those spaces from `chosen` and refund their cost; if none stay, the Operation changes nothing | `src/dryrun.mjs:134` (after a `before` Special Activity), `src/effects.mjs:181` (`refundCost`); test "a before-timed Special Activity that makes a chosen space illegal drops it and refunds its cost" (`test/bots.test.mjs`); rule in `docs/SCHEMA.md` |
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

