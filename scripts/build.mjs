// Builds the one-page tool (dist/index.html). Fails above the size limit (the plan's risk table).
// Env: BUILD_LIMIT_KIB overrides the limit (tests use it), BUILD_OUT overrides the output path.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { execSync } from "node:child_process";
import { LATEST } from "../src/migrate.mjs";

export const LIMIT_KIB = 950;
const limit = Number(process.env.BUILD_LIMIT_KIB ?? LIMIT_KIB);
const out = process.env.BUILD_OUT ?? "dist/index.html";

const r = await build({ entryPoints: ["ui/main.mjs"], bundle: true, format: "iife", write: false, minify: true, target: "es2022", loader: { ".json": "json" } });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
// The page names the commit it was built from (with -dirty for uncommitted changes) and its schema.
const git = (args) => { try { return execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
const commit = (git("rev-parse --short HEAD") || "unknown") + (git("status --porcelain") ? "-dirty" : "");
const html = readFileSync("ui/index.template.html", "utf8").replace("/*COMMIT*/", commit).replace("/*SCHEMA*/", LATEST).replace("/*APP*/", () => js);
const kib = Math.ceil(Buffer.byteLength(html) / 1024);
if (kib > limit) {
  console.error(`Build failed: ${out} is ${kib} KiB, over the limit of ${limit} KiB. Remove code or dependencies from the bundle, or raise LIMIT_KIB in scripts/build.mjs after review.`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out} ${kib} KiB (limit ${limit} KiB), commit ${commit}, schema ${LATEST}`);
