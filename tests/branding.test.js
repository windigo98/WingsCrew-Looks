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
  assert.match(app, /<footer class="legal">\$\{moreFromWingsCrewHtml\(\)\}/);
  assert.match(app, /function openAbout[^]*?moreFromWingsCrewHtml\(\)[^]*?\n\}/);
});

test("service worker precaches the logo; LICENSE and name intact; no secrets", async () => {
  const sw = await read("sw.js");
  assert.match(sw, /"\.\/assets\/brand\/logo\.webp"/);
  assert.match(sw, /"\.\/assets\/brand\/logo\.png"/);
  assert.match(sw, /wingscrew-looks-v19/);
  assert.match(await read("LICENSE"), /All rights reserved/i);
  const app = await read("js/app.js");
  assert.doesNotMatch(app + (await read("index.html")), /Try-On/);
  assert.doesNotMatch(app, /sk-[A-Za-z0-9]{20,}|api[_-]?key\s*[:=]\s*["'][A-Za-z0-9]{16,}/i);
});
