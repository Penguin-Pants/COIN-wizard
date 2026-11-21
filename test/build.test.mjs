import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const build = (env) => {
  const out = mkdtempSync(join(tmpdir(), "coin-build-"));
  const r = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, encoding: "utf8", env: { ...process.env, BUILD_OUT: join(out, "index.html"), ...env } });
  return { ...r, out: join(out, "index.html"), done: () => rmSync(out, { recursive: true, force: true }) };
};

test("the build fails with a clear message above the size limit", () => {
  const r = build({ BUILD_LIMIT_KIB: "100" });
  try {
    assert.notEqual(r.status, 0, "exit code");
    assert.match(r.stderr, /is \d+ KiB, over the limit of 100 KiB/);
    assert.equal(existsSync(r.out), false, "no page is written above the limit");
  } finally { r.done(); }
});

test("the build passes under the default limit of 700 KiB", () => {
  const r = build({});
  try {
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /KiB \(limit 700 KiB\)/);
  } finally { r.done(); }
});

test("the built page names its commit and schema version", async () => {
  const { readFileSync } = await import("node:fs");
  const { LATEST } = await import("../src/migrate.mjs");
  const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const r = build({});
  try {
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(r.out, "utf8");
    assert.match(html, new RegExp(`<p id="about">Build ${commit}(-dirty)?, schema ${LATEST.replace(/[./]/g, "\\$&")}</p>`));
    assert.match(r.stdout, new RegExp(`commit ${commit}`));
  } finally { r.done(); }
});
