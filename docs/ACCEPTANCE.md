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

1. Dry runs do not change the board between an Operation and its linked Special Activity.
2. No example uses `markerSet`. Its rule is in the engine contract only.
3. The faction aid follows the content order of the COIN series foldouts (Operations, Special Activities, Victory). It was not compared with an image of a printed GMT sheet.
4. Print output was checked by PDF page counts and page box sizes, not on paper.
5. Claim checks call Claude. The browser tests use scripted answers. A real claim check needs the live artifact.
6. The dry runs of the 3- and 4-faction examples store the results of a run as expected. They catch changes, not design intent.
7. Live URL fetch from the artifact page is blocked by its content security policy (high confidence, from the platform guide). The chat handoff is the intake path.

Closed on 2026-11-21 (3 and 4 factions are a core requirement): `other.resources` replaced by per-faction and rival values; bots pick their enemy with opponent tables; templates target a chosen enemy; a click-through test builds 3- and 4-faction games from empty.
