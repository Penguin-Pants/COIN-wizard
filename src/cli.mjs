#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { validate } from "./validate.mjs";
import { migrate } from "./migrate.mjs";
import { toMarkdown, toMermaid, toPolicyYaml } from "./botaid.mjs";
import { buildFiles } from "./kit.mjs";
import { zip } from "./zip.mjs";

const [cmd, file, outDir] = process.argv.slice(2);
if (!cmd || !file) { console.error("Usage: cli.mjs validate <game.json> | export <game.json> <outDir> | zip <game.json> <out.zip>"); process.exit(2); }

const source = JSON.parse(readFileSync(file, "utf8"));
const game = migrate(source);
if (game.meta.schemaVersion !== source.meta.schemaVersion) console.log(`MIGRATED ${source.meta.schemaVersion} to ${game.meta.schemaVersion} in memory. The file is unchanged.`);
const r = validate(game);
for (const e of r.errors) console.log(`ERROR  ${e.path}  [${e.code}]  ${e.message}  (fix in: ${e.editor})`);
for (const w of r.warnings) console.log(`WARN   ${w.path}  [${w.code}]  ${w.message}`);
console.log(r.ok ? `VALID (${r.warnings.length} warnings)` : `INVALID (${r.errors.length} errors)`);
if (!r.ok) process.exit(1);

// export writes every kit and bot file, the same set the wizard puts in its zip. zip writes that zip.
if (cmd === "export" || cmd === "zip") {
  const files = buildFiles(game, { toMermaid, toMarkdown, toPolicyYaml });
  if (cmd === "zip") {
    writeFileSync(outDir, zip(files));
    console.log(`Wrote ${files.length} files to ${outDir}`);
  } else {
    for (const [p, text] of files) { mkdirSync(dirname(join(outDir, p)), { recursive: true }); writeFileSync(join(outDir, p), text); }
    console.log(`Exported ${files.length} files to ${outDir}`);
  }
}
