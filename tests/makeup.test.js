import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  LAYER_IDS,
  MAKEUP_AUDIENCES,
  MAKEUP_LAYERS,
  MAKEUP_LOOKS,
  MAKEUP_SHADES,
  isBare,
  lookById,
  lookName,
  looksFor,
  resolveLook,
} from "../js/makeup-looks.js";
import {
  MESH,
  blurArray,
  createMask,
  faceRegions,
  fillPolygon,
  lipMask,
  paintMakeup,
  pigmentPixel,
  toPixels,
} from "../js/makeup-engine.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/makeup-landmarks.json", import.meta.url), "utf8"));
const W = fixture.width;
const H = fixture.height;

/** A face-ish test image: textured skin, a darker lip, a light background. */
function testImage(landmarks, { skin = [196, 150, 126], lip = [170, 104, 100], seed = 7 } = {}) {
  const data = new Uint8ClampedArray(W * H * 4);
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const pts = toPixels(landmarks, W, H);
  const R = faceRegions(pts);
  const lips = createMask(0, 0, W, H);
  fillPolygon(lips, R.lipsOuter);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4;
      const n = (rand() - 0.5) * 24;
      const m = Math.min(1, lips.data[y * W + x]);
      for (let c = 0; c < 3; c += 1) data[o + c] = skin[c] * (1 - m) + lip[c] * m + n;
      data[o + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

function polygonArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(a / 2);
}

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Distance from a point to a polygon's edge. */
function edgeDistance(poly, x, y) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}

/** The same face with the mouth open (lower lip and its inner edge moved down). */
function openMouth(landmarks, drop = 0.018) {
  const lower = new Set([14, 87, 178, 88, 95, 317, 402, 318, 324, 17, 84, 181, 91, 146, 314, 405, 321, 375]);
  return landmarks.map((p, i) => (lower.has(i) ? [p[0], p[1] + drop] : p));
}

function changed(a, b, o) {
  return Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]);
}

const only = (layer, settings) => {
  const custom = {};
  for (const id of LAYER_IDS) custom[id] = { amount: 0 };
  custom[layer] = settings;
  return resolveLook("none", custom);
};

test("there are 12 trend looks plus groomed looks for men", () => {
  const women = looksFor("women");
  const men = looksFor("men");
  assert.ok(women.length >= 12, `women looks: ${women.length}`);
  assert.ok(men.length >= 4, `men looks: ${men.length}`);
  for (const id of ["natural", "soft-glam", "clean-girl", "bold-red", "smoky", "graphic-wing", "latte", "cherub-blush", "sunset", "glossy-berry", "bronzed-summer", "editorial-pop", "groomed-natural", "brow-tidy", "matte-skin"]) {
    assert.equal(lookById(id).id, id, id);
  }
  assert.deepEqual(MAKEUP_AUDIENCES.map((item) => item.id), ["women", "men"]);
  const ids = MAKEUP_LOOKS.map((look) => look.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every layer the brief asks for exists, with shade ranges", () => {
  for (const id of ["lips", "blush", "bronzer", "highlight", "shadow", "liner", "brows", "lashes", "freckles", "skin"]) assert.ok(LAYER_IDS.includes(id), id);
  const fixed = (layer) => MAKEUP_SHADES[layer].filter((shade) => !shade.auto);
  assert.ok(fixed("lips").length >= 8);
  assert.ok(fixed("blush").length >= 6);
  assert.ok(fixed("shadow").length >= 8);
  assert.deepEqual(MAKEUP_LAYERS.find((item) => item.id === "lips").styles.map(([id]) => id), ["matte", "satin", "gloss"]);
  assert.deepEqual(MAKEUP_LAYERS.find((item) => item.id === "liner").styles.map(([id]) => id).slice(0, 2), ["thin", "winged"]);
  for (const [layer, shades] of Object.entries(MAKEUP_SHADES)) {
    for (const shade of shades) assert.match(shade.hex, /^#[0-9a-f]{6}$/i, `${layer}/${shade.id}`);
  }
});

test("presets only use real shades and styles", () => {
  for (const look of MAKEUP_LOOKS) {
    for (const [layer, entry] of Object.entries(look.layers)) {
      assert.ok(LAYER_IDS.includes(layer), `${look.id}: ${layer}`);
      if (entry.shade) assert.ok(MAKEUP_SHADES[layer].some((shade) => shade.id === entry.shade), `${look.id}: ${layer} ${entry.shade}`);
      if (entry.crease) assert.ok(MAKEUP_SHADES.shadow.some((shade) => shade.id === entry.crease), `${look.id}: crease`);
      const styles = MAKEUP_LAYERS.find((item) => item.id === layer).styles.map(([id]) => id);
      if (entry.style) assert.ok(styles.includes(entry.style), `${look.id}: ${layer} style ${entry.style}`);
      assert.ok(entry.amount > 0 && entry.amount <= 1);
    }
  }
});

test("resolveLook fills every layer and applies custom changes", () => {
  const base = resolveLook("soft-glam");
  assert.deepEqual(Object.keys(base), LAYER_IDS);
  assert.equal(base.lips.shade, "nude-rose");
  const edited = resolveLook("soft-glam", { lips: { shade: "red", style: "matte", amount: 2 }, blush: { amount: 0 } });
  assert.equal(edited.lips.shade, "red");
  assert.equal(edited.lips.style, "matte");
  assert.equal(edited.lips.amount, 1);
  assert.equal(edited.blush.amount, 0);
  assert.equal(resolveLook("no-such-look").lips.amount, 0);
  assert.ok(isBare(resolveLook("none")));
  assert.equal(resolveLook("soft-glam", { lips: { shade: "nope" } }).lips.shade, MAKEUP_SHADES.lips[0].id);
  assert.equal(lookName("soft-glam", {}), "Soft Glam");
  assert.equal(lookName("soft-glam", { lips: { amount: 0.2 } }), "Soft Glam (edited)");
});

test("polygon fill covers the polygon's area and blur keeps the total", () => {
  const poly = [{ x: 10.3, y: 10.2 }, { x: 60.7, y: 14.1 }, { x: 40.2, y: 50.6 }];
  const mask = createMask(0, 0, 80, 80);
  fillPolygon(mask, poly);
  const sum = mask.data.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - polygonArea(poly)) / polygonArea(poly) < 0.02, `${sum} vs ${polygonArea(poly)}`);
  blurArray(mask.data, 80, 80, 6);
  const after = mask.data.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(after - sum) / sum < 0.03);
});

test("pigment keeps the skin's light and shade", () => {
  const d = new Uint8ClampedArray([100, 80, 70, 255, 160, 130, 115, 255]);
  pigmentPixel(d, 0, [180, 30, 50], 80, 1, 0.8, 0.9, 130);
  pigmentPixel(d, 4, [180, 30, 50], 80, 1, 0.8, 0.9, 130);
  const l = (o) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
  assert.ok(l(4) > l(0) + 10, "brighter skin stays brighter under the same color");
  assert.ok(d[0] > d[1] * 2, "takes the shade's hue");
});

for (const [model, landmarks] of Object.entries(fixture.faces)) {
  test(`${model}: no look changes anything off the face`, () => {
    const pts = toPixels(landmarks, W, H);
    const R = faceRegions(pts);
    for (const look of MAKEUP_LOOKS) {
      const img = testImage(landmarks);
      const before = Uint8ClampedArray.from(img.data);
      const result = paintMakeup(img, landmarks, resolveLook(look.id));
      assert.ok(result, look.id);
      let outside = 0;
      for (let y = 0; y < H; y += 3) {
        for (let x = 0; x < W; x += 3) {
          if (changed(img.data, before, (y * W + x) * 4) <= 3) continue;
          if (inside(R.faceOval, x, y) || edgeDistance(R.faceOval, x, y) < 2) continue;
          outside += 1;
        }
      }
      assert.equal(outside, 0, `${look.id} painted ${outside} pixels off the face`);
      if (look.id === "none") assert.deepEqual(img.data, before);
    }
  });

  test(`${model}: lipstick stays inside the lip line and off the teeth`, () => {
    const open = openMouth(landmarks);
    const pts = toPixels(open, W, H);
    const R = faceRegions(pts);
    assert.ok(polygonArea(R.lipsInner) > 150, "mouth is open in this test");
    const img = testImage(open);
    // Teeth: bright, low-color pixels inside the mouth opening.
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      if (!inside(R.lipsInner, x + 0.5, y + 0.5)) continue;
      const o = (y * W + x) * 4;
      img.data[o] = 236;
      img.data[o + 1] = 232;
      img.data[o + 2] = 224;
    }
    const before = Uint8ClampedArray.from(img.data);
    paintMakeup(img, open, only("lips", { amount: 1, shade: "red", style: "gloss" }));
    let bleed = 0;
    let teeth = 0;
    let painted = 0;
    let lipPixels = 0;
    const xs = R.lipsOuter.map((p) => p.x);
    const ys = R.lipsOuter.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs) - 4, Math.max(...xs) + 4, Math.min(...ys) - 4, Math.max(...ys) + 4];
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const o = (y * W + x) * 4;
        const delta = changed(img.data, before, o);
        if (x < x0 || x > x1 || y < y0 || y > y1) {
          if (delta > 2) bleed += 1;
          continue;
        }
        const cx = x + 0.5;
        const cy = y + 0.5;
        const inOuter = inside(R.lipsOuter, cx, cy);
        const inInner = inside(R.lipsInner, cx, cy);
        if (!inOuter && edgeDistance(R.lipsOuter, cx, cy) > 0.75 && delta > 2) bleed += 1;
        if (inInner && edgeDistance(R.lipsInner, cx, cy) > 0.75 && delta > 2) teeth += 1;
        if (inOuter && !inInner && edgeDistance(R.lipsOuter, cx, cy) > 3 && edgeDistance(R.lipsInner, cx, cy) > 3) {
          lipPixels += 1;
          if (delta > 40) painted += 1;
        }
      }
    }
    assert.equal(bleed, 0, `${bleed} pixels past the lip line`);
    assert.equal(teeth, 0, `${teeth} pixels on the teeth`);
    assert.ok(painted / lipPixels > 0.95, `only ${painted}/${lipPixels} lip pixels got color`);
  });

  test(`${model}: eye makeup never lands on the eye itself`, () => {
    const pts = toPixels(landmarks, W, H);
    const R = faceRegions(pts);
    const img = testImage(landmarks);
    const before = Uint8ClampedArray.from(img.data);
    const custom = {};
    for (const id of LAYER_IDS) custom[id] = { amount: 0 };
    Object.assign(custom, { shadow: { amount: 1, shade: "charcoal", style: "smoky", crease: "plum" }, blush: { amount: 1, shade: "berry", style: "cherub" }, highlight: { amount: 1 }, bronzer: { amount: 1, style: "contour" }, freckles: { amount: 1 } });
    paintMakeup(img, landmarks, resolveLook("none", custom));
    for (const side of ["a", "b"]) {
      let hits = 0;
      const eye = R.sides[side].eye;
      const ex = eye.map((p) => p.x);
      const ey = eye.map((p) => p.y);
      for (let y = Math.floor(Math.min(...ey)); y <= Math.ceil(Math.max(...ey)); y += 1) for (let x = Math.floor(Math.min(...ex)); x <= Math.ceil(Math.max(...ex)); x += 1) {
        if (!inside(R.sides[side].eye, x + 0.5, y + 0.5) || edgeDistance(R.sides[side].eye, x + 0.5, y + 0.5) < 2) continue;
        if (changed(img.data, before, (y * W + x) * 4) > 6) hits += 1;
      }
      assert.equal(hits, 0, `${side} eye: ${hits} pixels`);
    }
  });

  test(`${model}: makeup keeps the skin texture`, () => {
    const img = testImage(landmarks, { seed: 11 });
    const before = Uint8ClampedArray.from(img.data);
    paintMakeup(img, landmarks, resolveLook("soft-glam"));
    const pts = toPixels(landmarks, W, H);
    const R = faceRegions(pts);
    const mask = lipMask(img, R);
    const a = [];
    const b = [];
    for (let y = 0; y < mask.h; y += 1) for (let x = 0; x < mask.w; x += 1) {
      if (mask.data[y * mask.w + x] < 0.9) continue;
      const o = ((y + mask.y) * W + x + mask.x) * 4;
      a.push(0.299 * before[o] + 0.587 * before[o + 1] + 0.114 * before[o + 2]);
      b.push(0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2]);
    }
    const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    const ma = mean(a);
    const mb = mean(b);
    let cov = 0;
    let va = 0;
    let vb = 0;
    for (let i = 0; i < a.length; i += 1) {
      cov += (a[i] - ma) * (b[i] - mb);
      va += (a[i] - ma) ** 2;
      vb += (b[i] - mb) ** 2;
    }
    const r = cov / Math.sqrt(va * vb);
    assert.ok(r > 0.8, `texture correlation ${r.toFixed(2)}`);
  });

  test(`${model}: hair over the face keeps makeup off it`, () => {
    const img = testImage(landmarks);
    const before = Uint8ClampedArray.from(img.data);
    const hair = { width: 64, height: 64, data: new Float32Array(64 * 64).fill(1) };
    paintMakeup(img, landmarks, resolveLook("soft-glam", { skin: { amount: 0 } }), { hair });
    let moved = 0;
    for (let i = 0; i < img.data.length; i += 4) if (changed(img.data, before, i) > 2) moved += 1;
    assert.equal(moved, 0);
  });
}

test("every look paints on both women and men", () => {
  for (const model of ["oval-woman", "oval-man"]) {
    for (const look of MAKEUP_LOOKS) {
      if (look.id === "none") continue;
      const img = testImage(fixture.faces[model]);
      const before = Uint8ClampedArray.from(img.data);
      const result = paintMakeup(img, fixture.faces[model], resolveLook(look.id));
      assert.ok(result.painted.length > 0, `${model}/${look.id}`);
      let moved = 0;
      for (let i = 0; i < img.data.length; i += 4) if (changed(img.data, before, i) > 4) moved += 1;
      assert.ok(moved > 50, `${model}/${look.id} changed only ${moved} pixels`);
    }
  }
});

test("bad landmarks paint nothing", () => {
  const img = testImage(fixture.faces["oval-woman"]);
  assert.equal(paintMakeup(img, null, resolveLook("soft-glam")), null);
  assert.equal(paintMakeup(img, [[0.5, 0.5]], resolveLook("soft-glam")), null);
  assert.equal(MESH.lipsOuter.length, 20);
});

test("the Makeup tab is wired in and keeps the house rules", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const screen = await readFile(new URL("../js/makeup-screen.js", import.meta.url), "utf8");
  const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(app, /\["makeup", "Makeup", icon\("makeup"\)\]/);
  assert.match(app, /mountMakeup\(view, makeupContext\(\)\)/);
  assert.match(app, /if \(look\.makeup\)/);
  assert.match(index, /css\/makeup\.css\?v=2/);
  assert.match(index, /<title>WingsCrew Looks<\/title>/);
  for (const file of ["./css/makeup.css?v=2", "./js/makeup-screen.js?v=2", "./js/makeup-engine.js", "./js/makeup-looks.js"]) {
    assert.ok(sw.includes(`"${file}"`), file);
    await stat(new URL(`../${file.slice(2).split("?")[0]}`, import.meta.url));
  }
  assert.match(screen, /ctx\.footerHtml\(\)/);
  assert.match(screen, /Made-up people, not real ones/);
  for (const text of [screen, index]) assert.doesNotMatch(text.replace(/<title>.*<\/title>/, ""), /Try-On/);
  const engine = await readFile(new URL("../js/makeup-engine.js", import.meta.url), "utf8");
  for (const text of [screen, engine]) {
    assert.doesNotMatch(text, /fetch\(|XMLHttpRequest|supabase|api[_-]?key|sk-[a-z0-9]/i, "makeup code makes no network calls and holds no keys");
  }
});
