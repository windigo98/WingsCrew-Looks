import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const URL_RE = /const WINGSCREW_URL = "https:\/\/wingscrew\.com\/";/;

test("brand logo assets are in the repo and small", async () => {
  for (const f of ["assets/brand/logo.webp", "assets/brand/logo.png"]) {
    const s = await stat(new URL(`../${f}`, import.meta.url));
    assert.ok(s.size > 0 && s.size < 60000, `${f} size ${s.size}`);
  }
});

test("header shows a small 'by WingsCrew' credit with the logo and a png fallback", async () => {
  const app = await read("js/app.js");
  const css = await read("css/app.css");
  assert.match(app, URL_RE);
  assert.match(app, /class="wc-credit" href="\$\{WINGSCREW_URL\}" target="_blank" rel="noopener"/);
  assert.match(app, /<source srcset="assets\/brand\/logo\.webp" type="image\/webp"><img src="assets\/brand\/logo\.png"/);
  assert.match(app, /<span>by WingsCrew<\/span>/);
  assert.match(app, /<header[^]*?brandCreditHtml\(\)[^]*?<\/header>/);
  const h = css.match(/\.wc-credit img \{[^}]*height: (\d+)px/);
  assert.ok(h && +h[1] >= 18 && +h[1] <= 24, "logo 18-24px tall");
});

test("every visible WingsCrew mention in the UI is a link to wingscrew.com", async () => {
  const app = await read("js/app.js");
  assert.match(app, /function wcLink\(text = "WingsCrew"\) \{\s*return `<a class="wc-link" href="\$\{WINGSCREW_URL\}" target="_blank" rel="noopener">/);
  assert.match(app, /© 2026 \$\{wcLink\(\)\}\. All rights reserved\./);
  // Template markup (between > and <) must not contain a bare "WingsCrew" text node, except inside the credit/button links.
  const bare = [...app.matchAll(/>([^<>`$]*WingsCrew[^<>`$]*)</g)].map((m) => m[1].trim())
    .filter((t) => t !== "by WingsCrew" && t !== "More from WingsCrew ↗");
  assert.deepEqual(bare, []);
  for (const m of app.matchAll(/<a [^>]*wingscrew\.com|<a [^>]*WINGSCREW_URL[^>]*>/g)) {
    assert.match(m[0], /target="_blank" rel="noopener"/);
  }
});

test("'More from WingsCrew' button is in the footer and About", async () => {
  const app = await read("js/app.js");
  assert.match(app, /class="btn ghost wc-more" href="\$\{WINGSCREW_URL\}" target="_blank" rel="noopener">More from WingsCrew/);
  assert.match(app, /<footer class="legal">\$\{more \? moreFromWingsCrewHtml\(\) : ""\}/);
  assert.match(app, /function openAbout[^]*?moreFromWingsCrewHtml\(\)[^]*?\n\}/);
});

test("service worker precaches the logo; LICENSE and name intact; no secrets", async () => {
  const sw = await read("sw.js");
  assert.match(sw, /"\.\/assets\/brand\/logo\.webp"/);
  assert.match(sw, /"\.\/assets\/brand\/logo\.png"/);
  assert.match(sw, /wingscrew-looks-v20/);
  assert.match(await read("LICENSE"), /All rights reserved/i);
  const app = await read("js/app.js");
  assert.doesNotMatch(app + (await read("index.html")), /Try-On/);
  assert.doesNotMatch(app, /sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]\s*["'][A-Za-z0-9]{16,}/i);
});

test("About has one More-from button and every sheet has a Close control", async () => {
  const app = await read("js/app.js");
  const about = app.match(/function openAbout[^]*?\n\}/)[0];
  assert.equal((about.match(/moreFromWingsCrewHtml\(\)/g) || []).length, 1);
  assert.match(about, /footerHtml\(\{ more: false \}\)/);
  assert.match(about, /data-sheet-close>Done</);
  assert.match(about, /© 2026|footerHtml/);
  assert.match(app, /function openSheet[^]*?<button type="button" class="sheet-close" data-sheet-close aria-label="Close">✕<\/button>/);
  assert.match(app, /closest\("\[data-sheet-close\]"\)\) \{\s*closeSheet\(\)/);
  assert.match(app, /event\.key === "Escape"[^]*?closeSheet\(\)/);
  const css = await read("css/app.css");
  assert.match(css, /\.sheet-close \{[^}]*width: 44px; height: 44px/);
});

test("first-run welcome: localStorage flag, steps, Get started/Skip, reopen from About", async () => {
  const app = await read("js/app.js");
  assert.match(app, /const WELCOME_KEY = "wcl-welcome-seen";/);
  assert.match(app, /localStorage\.getItem\(WELCOME_KEY\)/);
  assert.match(app, /localStorage\.setItem\(WELCOME_KEY, "1"\)/);
  const w = app.match(/function openWelcome[^]*?\n\}/)[0];
  assert.match(w, /Welcome to \$\{wcLink\(\)\} Looks/);
  assert.match(w, /Fit or Miss\?/);
  assert.equal((w.match(/<li>/g) || []).length, 3);
  assert.match(w, /photos stay on this phone/);
  assert.match(w, /data-sheet-close>Get started</);
  assert.match(w, /data-sheet-close>Skip</);
  assert.match(w, /openSheet\(/); // gets the shared ✕ Close button
  assert.match(app, /function render\(\) \{\s*if \(!state\.ready\) return;\s*queueMicrotask\(maybeWelcome\);/);
  assert.match(app.match(/function openAbout[^]*?\n\}/)[0], /data-action="how-it-works">How it works</);
  assert.match(app, /action === "how-it-works"\) \{ closeSheet\(\); openWelcome\(\); \}/);
});

test("empty Dress: start hint shown and action bar hidden until a photo exists", async () => {
  const app = await read("js/app.js");
  assert.match(app, /<p class="start-hint">Start here ↓<\/p>/);
  assert.match(app, /<div class="studio-actions row" \$\{photo \? "" : "hidden"\}>/);
  const css = await read("css/app.css");
  assert.match(css, /\.studio-actions\[hidden\] \{ display: none; \}/);
});
