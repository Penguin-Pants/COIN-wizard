// Builds the one-page tool (dist/index.html). Fails above the size limit (the plan's risk table).
// Env: BUILD_LIMIT_KIB overrides the limit (tests use it), BUILD_OUT overrides the output path.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const LIMIT_KIB = 700;
const limit = Number(process.env.BUILD_LIMIT_KIB ?? LIMIT_KIB);
const out = process.env.BUILD_OUT ?? "dist/index.html";

const r = await build({ entryPoints: ["ui/main.mjs"], bundle: true, format: "iife", write: false, minify: true, target: "es2022", loader: { ".json": "json" } });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync("ui/index.template.html", "utf8").replace("/*APP*/", () => js);
const kib = Math.ceil(Buffer.byteLength(html) / 1024);
if (kib > limit) {
  console.error(`Build failed: ${out} is ${kib} KiB, over the limit of ${limit} KiB. Remove code or dependencies from the bundle, or raise LIMIT_KIB in scripts/build.mjs after review.`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${out} ${kib} KiB (limit ${limit} KiB)`);
