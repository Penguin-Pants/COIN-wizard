// UI test harness: opens dist/index.html in Chrome with a mocked window.claude.
// Browser path: set CHROME_PATH to override the default.
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const DIST = pathToFileURL(resolve("dist/index.html")).href;
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

// Runs inside the page, before the app loads.
function mockClaude({ saved, sources, replies, failWrites }) {
  window.__failWrites = failWrites;
  window.__saved = { ...saved };
  window.__dl = [];
  window.__snap = false;
  const SA = '[{"name":"Dawn Raid","kind":"specialActivity","templateId":"raid","why":"Raids funded the war."},{"name":"Roadside Ambush","kind":"specialActivity","templateId":"ambush","why":"Flying columns."},{"name":"Bad One","kind":"specialActivity","templateId":"nope","why":"x"}]';
  const doc = (p) => ({
    get: async () => ({ exists: p in window.__saved, data: () => window.__saved[p] }),
    // failWrites: the first n draft writes fail, to test retry.
    set: async (d) => { if (p.endsWith("/draft") && window.__failWrites > 0) { window.__failWrites--; throw Object.assign(new Error("offline"), { code: "unavailable" }); } window.__saved[p] = d; },
    delete: async () => { delete window.__saved[p]; }
  });
  const caps = {
    db: {
      doc,
      collection: () => ({
        onSnapshot: (cb) => {
          // Tests call __pushSources to send a later status update from chat.
          window.__pushSources = (list) => cb({ docs: list.map((s) => ({ id: s.id, data: () => s })) });
          window.__snap = true;
          setTimeout(() => cb({ docs: sources.map((s) => ({ id: s.id, data: () => s })) }), 50);
          return () => {};
        }
      })
    },
    user: { id: async () => "u1" },
    // replies: [[text the prompt contains, reply text], ...] checked before the defaults.
    // A third element delays the reply by that many milliseconds.
    sample: async (p) => { const r = replies.find(([k]) => p.includes(k)); if (r?.[2]) await new Promise((ok) => setTimeout(ok, r[2])); return { text: r?.[1] ?? (p.includes("Suggest 4 Special Activities") ? SA : "[]") }; },
    // The last saved file's bytes are kept, so a test can unzip the kit.
    downloads: { save: async (o) => { window.__dl.push(o.filename); if (o.data instanceof Blob) window.__dlBytes = Array.from(new Uint8Array(await o.data.arrayBuffer())); } }
  };
  window.claude = { use: async (n) => caps[n] };
}

const DEFAULT_SOURCES = [
  { id: "s1", status: "read", text: "Sample article text", readScope: "chars 0-19", title: "T" },
  { id: "s2", status: "failed", failure: "HTTP 403" }
];

export const launch = () => chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

// example: true loads Tan War through the Project menu, as a designer would. The app itself starts blank.
export async function openApp(browser, { saved = {}, sources = DEFAULT_SOURCES, colorScheme = "light", viewport = { width: 1280, height: 900 }, example = true, replies = [], failWrites = 0 } = {}) {
  const page = await browser.newPage({ viewport, colorScheme });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console:" + m.text()); });
  await page.addInitScript(mockClaude, { saved, sources, replies, failWrites });
  await page.goto(DIST);
  await page.waitForFunction(() => window.__snap === true);
  await frames(page);
  if (example) await loadExample(page);
  return { page, errors, db: () => page.evaluate(() => window.__saved), close: () => page.close() };
}

export async function loadExample(page) {
  await page.click("#menu summary");
  await page.click('#menu [data-a="confirm-ask"][data-key="example"]');
  await page.click('#menu [data-a="load-example"]');
  await frames(page);
}

// Let queued renders finish.
export const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Steps are 0 to 4. Faction sub rows in the rail are skipped.
export async function goStep(page, i) {
  await page.locator("#rail li:not(.fsub) button").nth(i).click();
  await frames(page);
}

export async function setScheme(page, colorScheme) {
  await page.emulateMedia({ colorScheme });
  await page.waitForFunction((dark) => matchMedia("(prefers-color-scheme: dark)").matches === dark, colorScheme === "dark");
  await frames(page);
}
