import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const r = await build({ entryPoints: ["ui/main.mjs"], bundle: true, format: "iife", write: false, minify: true, target: "es2022", loader: { ".json": "json" } });
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync("ui/index.template.html", "utf8").replace("/*APP*/", () => js);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KiB`);
