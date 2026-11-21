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
| 6 | 3- and 4-faction dry runs store run results as expected | Open | |
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
