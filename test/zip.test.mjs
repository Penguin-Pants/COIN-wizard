import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32 as nodeCrc } from "node:zlib";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, zip } from "../src/zip.mjs";
import { read } from "./zipread.mjs";

const enc = new TextEncoder();
const FILES = [["a.txt", "hello"], ["kit/b.md", "# Title\nÄrger, naïve, 日本"], ["empty.txt", ""], ["bin.dat", new Uint8Array([0, 1, 2, 255])]];

test("crc32 matches Node's zlib", () => {
  for (const s of ["", "a", "hello world", "日本語"]) assert.equal(crc32(enc.encode(s)), nodeCrc(enc.encode(s)));
});

test("unzip returns every file unchanged, stored, with a correct CRC", () => {
  const files = read(zip(FILES));
  assert.deepEqual(files.map((f) => f.name), FILES.map((f) => f[0]));
  files.forEach((f, i) => {
    const want = typeof FILES[i][1] === "string" ? enc.encode(FILES[i][1]) : FILES[i][1];
    assert.deepEqual([...f.data], [...want]);
    assert.equal(f.crc, nodeCrc(want));
    assert.equal(f.method, 0);
  });
});

test("an independent unzip tool accepts the archive", () => {
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  try {
    const p = join(dir, "kit.zip"); writeFileSync(p, zip(FILES));
    const out = execFileSync("python3", ["-I", "-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip()); print(z.read('kit/b.md').decode())", p]).toString();
    assert.match(out, /^None\n# Title\nÄrger, naïve, 日本/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
