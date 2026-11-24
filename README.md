# COIN-wizard

A guided tool for designing a COIN-series board game (2 to 4 factions), from a conflict to a print-and-play kit and a machine-readable game file.

- **Live tool:** a Claude artifact, "COIN Game Design Wizard". `npm run build` writes `dist/index.html`, the page that is published.
- **Game file:** one JSON document per game, schema `coin-game/1.7.0` (frozen). Guide: `docs/SCHEMA.md`.
- **Engine contract:** a game engine imports `game.json` and validates it against `schema/coin-game.schema.json`. See "Engine contract" in `docs/SCHEMA.md`.
- **Acceptance and known issues:** `docs/ACCEPTANCE.md`.

## Run

```
npm install
npm test          # node tests: schema, validator, bots, kit, examples
npm run test:ui   # browser tests (Playwright with system Chrome; set CHROME_PATH if needed)
npm run build     # writes dist/index.html
node src/cli.mjs validate examples/four-valleys.game.json
node src/cli.mjs zip examples/four-valleys.game.json out/four-valleys.zip
```

## Publish

1. `make publish-check`: both test suites, the build, then the page path and the commit (the page footer shows the same commit and schema).
2. In a Claude chat, give Claude `dist/index.html` and ask it to publish a new version of the "COIN Game Design Wizard" artifact.

## Layout

| Folder | Holds |
|---|---|
| `ui/` | Wizard screens, components and the page template |
| `src/` | Validator, migration, expressions, bot dry runs, templates, deck, kit export, zip writer |
| `schema/` | The JSON Schema |
| `examples/` | Tan War (2 factions), Harbor Strike (3), Four Valleys (4) |
| `test/` | Node tests, browser tests in `test/ui/`, frozen fixtures of past schema versions |
| `docs/` | Schema guide and acceptance results |
