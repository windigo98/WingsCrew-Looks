import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  FACE_POINTS,
  FACE_SHAPES,
  CONTOUR_STEPS,
  HAIR_FINISHES,
  FACE_OVAL,
  HAIR_AUDIENCES,
  HAIR_COLORS,
  HAIR_FACE,
  HAIR_GROUPS,
  HAIR_LOOKS,
  HAIR_LIFT_RANGE,
  HAIR_MODELS,
  HAIR_STYLES,
  HAIR_VIEW_H,
  HAIR_VIEW_W,
  HEAD,
  LOOK_MODELS,
  MIN_CROWN,
  containRect,
  contourRadius,
  domeThinning,
  finishAmount,
  defaultHairPlacement,
  facePointsFromLandmarks,
  fitHairToFace,
  hairColorLut,
  hairFrame,
  hairLookSrc,
  hairModelById,
  hairStylesFor,
  headContour,
  hexToRgb,
  modelAudience,
  openingRadius,
  pushBackOval,
  recolorHairPixels,
  tintHairPixels,
  warpSource,
} from "../js/hair.js";

const SALON_NAMES = {
  women: [
    "Sleek Chin Bob", "Italian Lob", "Butterfly Cut", "Long Layers", "Bouncy Blowout", "Beach Waves", "Silk Press", "Defined Curls",
    "Knotless Braids", "Sleek High Ponytail", "High Bun / Chignon", "Textured Pixie", "Wolf Cut", "Natural Afro", "Shoulder Locs", "Wispy Bangs Shag",
  ],
  men: [
    "Low Taper + Textured Crop", "Buzz Cut", "Classic Side Part", "Comma Hair", "Two-Block", "Soft Wolf Cut", "Modern Mullet",
    "Flow (Swept Back)", "High-Top Fade", "360 Waves", "Curly Top + Taper", "Two-Strand Twists", "Stitch Braids", "Shoulder Locs",
  ],
};

const FACES = JSON.parse(await readFile(new URL("./fixtures/face-points.json", import.meta.url), "utf8"));

function webpSize(buffer) {
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const hasAlpha = (buffer[20] & 0x10) !== 0;
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height, hasAlpha };
  }
  return { width: 0, height: 0, hasAlpha: false };
}

test("trend sets: women's and men's styles and fourteen labeled colors", () => {
  assert.deepEqual(HAIR_AUDIENCES.map((item) => item.label), ["Women", "Men"]);
  assert.equal(new Set(HAIR_STYLES.map((style) => style.id)).size, HAIR_STYLES.length);
  assert.equal(new Set(HAIR_STYLES.map((style) => style.src)).size, HAIR_STYLES.length);
  assert.deepEqual(hairStylesFor("women").map((style) => style.label), SALON_NAMES.women);
  assert.deepEqual(hairStylesFor("men").map((style) => style.label), SALON_NAMES.men);
  assert.deepEqual(HAIR_GROUPS.map((group) => group.label), ["Short", "Medium", "Long", "Updos", "Textured"]);
  for (const style of HAIR_STYLES) {
    assert.match(style.src, /^assets\/hair\/[a-z0-9-]+\.webp$/);
    assert.ok(HAIR_GROUPS.some((group) => group.id === style.group), `${style.id} group`);
    assert.ok(style.for.length > 0 && style.for.every((who) => HAIR_AUDIENCES.some((item) => item.id === who)), `${style.id} audience`);
    assert.ok(style.face.chin > style.face.top && style.face.halfW > 40, `${style.id} has face-opening metadata`);
    assert.ok(style.face.crown >= 0 && style.face.crown < style.face.top, `${style.id} crown sits above the opening`);
    assert.ok(style.face.allow >= 0 && style.face.allow <= 0.4, `${style.id} crown allowance`);
    assert.doesNotMatch(style.label, /try-on/i);
  }
  for (const id of ["afro", "fade", "bun"]) {
    const big = HAIR_STYLES.find((style) => style.id === id);
    assert.ok(big.face.allow >= 0.2, `${id} keeps its height`);
  }
  for (const id of ["bob", "silk", "buzz", "waves360"]) {
    assert.ok(HAIR_STYLES.find((style) => style.id === id).face.allow <= 0.05, `${id} stays close to the head`);
  }
  assert.ok(!HAIR_STYLES.some((style) => /pompadour|man bun/i.test(style.label)));
  assert.deepEqual(HAIR_COLORS.map((color) => color.label), [
    "Jet Black", "Espresso", "Chestnut", "Light Brown", "Caramel Honey", "Golden Blonde", "Ash Blonde",
    "Platinum", "Copper", "Auburn", "Burgundy", "Silver Gray", "Rose Pink", "Lavender",
  ]);
  // Old saved looks keep working: the original ids are still here.
  for (const id of ["black", "dark-brown", "light-brown", "blonde", "auburn", "pink"]) assert.ok(HAIR_COLORS.some((c) => c.id === id), id);
  assert.equal(new Set(HAIR_COLORS.map((c) => c.id)).size, HAIR_COLORS.length);
});

test("each hairstyle is a transparent WebP of the same size, under 300 KB", async () => {
  for (const style of HAIR_STYLES) {
    const url = new URL(`../${style.src}`, import.meta.url);
    const info = await stat(url);
    assert.ok(info.size < 300 * 1024, `${style.src} is ${info.size} bytes`);
    const size = webpSize(await readFile(url));
    assert.equal(size.hasAlpha, true, `${style.src} needs an alpha channel`);
    assert.equal(size.width, HAIR_VIEW_W * 1.5);
    assert.equal(size.height, HAIR_VIEW_H * 1.5);
  }
});

test("service worker precaches the app at v18 and caches portraits as they're viewed", async () => {
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const fit = await readFile(new URL("../js/face-fit.js", import.meta.url), "utf8");
  assert.match(sw, /wingscrew-looks-v18/);
  assert.match(sw, /app\.js\?v=18/);
  assert.match(sw, /hair\.js\?v=18/);
  assert.match(sw, /face-fit\.js\?v=18/);
  assert.match(html, /app\.js\?v=18/);
  assert.match(app, /hair\.js\?v=18/);
  assert.match(app, /face-fit\.js\?v=18/);
  assert.match(fit, /hair\.js\?v=18/);
  assert.doesNotMatch(`${sw}${html}${app}${fit}`, /(app|hair|face-fit)\.js\?v=1[567]"/);
  for (const style of HAIR_STYLES) assert.ok(sw.includes(`./${style.src}`), style.src);
  for (const model of HAIR_MODELS) assert.ok(sw.includes(`./${model.src}`), model.src);
  for (const file of ["vision_bundle.mjs", "wasm/vision_wasm_internal.wasm", "face_landmarker.task", "hair_segmenter.tflite"]) {
    assert.ok(sw.includes(`./assets/vendor/mediapipe/${file}`), file);
  }
  assert.doesNotMatch(sw, /assets\/looks\/[a-z]/, "portraits are not precached");
  assert.match(sw, /LOOKS_PATH/);
  assert.doesNotMatch(sw, /sample-face|assets\/hair\/[a-z-]+\.svg/);
});

test("model portraits: every listed look exists, matches the model's set, and is small", async () => {
  assert.ok(LOOK_MODELS.length >= 4);
  for (const audience of ["women", "men"]) assert.ok(LOOK_MODELS.some((model) => modelAudience(model) === audience), audience);
  for (const [modelId, styles] of Object.entries(HAIR_LOOKS)) {
    const model = hairModelById(modelId);
    assert.ok(model, modelId);
    const audience = modelAudience(model);
    assert.deepEqual([...styles].sort(), hairStylesFor(audience).map((item) => item.id).sort(), `${modelId} wears its whole set`);
    for (const styleId of styles) {
      const src = hairLookSrc(modelId, styleId);
      assert.equal(src, `assets/looks/${modelId}/${styleId}.webp`);
      const buffer = await readFile(new URL(`../${src}`, import.meta.url));
      assert.equal(buffer.toString("ascii", 8, 12), "WEBP", src);
      assert.ok(buffer.length < 90 * 1024, `${src} is ${buffer.length} bytes`);
      const chunk = buffer.toString("ascii", 12, 16);
      // Lossy VP8: the frame size sits after the 3-byte start code.
      if (chunk === "VP8 ") {
        const w = buffer.readUInt16LE(26) & 0x3fff;
        const h = buffer.readUInt16LE(28) & 0x3fff;
        assert.ok(w <= 720 && h <= 960, `${src} ${w}x${h}`);
      }
    }
  }
  assert.equal(modelAudience(hairModelById("oval-man")), "men");
  assert.equal(modelAudience(hairModelById("oval-woman")), "women");
  assert.equal(hairLookSrc("oval-man", "bob"), null, "no women's cuts on the men");
  assert.equal(hairLookSrc("nobody", "bob"), null);
});

test("portrait recolor keeps strand light and shade and leaves skin alone", () => {
  const color = HAIR_COLORS.find((item) => item.id === "blonde");
  const lut = hairColorLut(color);
  const shades = [60, 80, 100, 120, 140];
  const data = new Uint8ClampedArray((shades.length + 1) * 4);
  shades.forEach((v, i) => data.set([v, v * 0.8, v * 0.6, 255], i * 4));
  data.set([200, 150, 120, 255], shades.length * 4); // skin
  const mask = new Float32Array([1, 1, 1, 1, 1, 0]);
  recolorHairPixels(data, mask, lut);
  const lum = (i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  for (let i = 1; i < shades.length; i += 1) assert.ok(lum(i) > lum(i - 1), "brighter strands stay brighter");
  assert.ok(lum(shades.length - 1) > 180, "blonde highlights are light");
  assert.deepEqual([...data.slice(shades.length * 4)], [200, 150, 120, 255], "skin untouched");
  const edge = new Uint8ClampedArray([100, 80, 60, 255]);
  recolorHairPixels(edge, new Float32Array([0.01]), lut);
  assert.deepEqual([...edge], [100, 80, 60, 255], "no hair, no change");
});

test("vendored hair segmenter is local and listed", async () => {
  const base = new URL("../assets/vendor/mediapipe/", import.meta.url);
  assert.ok((await stat(new URL("hair_segmenter.tflite", base))).size > 100000);
  const readme = await readFile(new URL("README.md", base), "utf8");
  assert.match(readme, /hair_segmenter\.tflite.*Apache-2\.0/);
  const fit = await readFile(new URL("../js/face-fit.js", import.meta.url), "utf8");
  assert.match(fit, /ImageSegmenter/);
  assert.match(fit, /hair_segmenter\.tflite/);
});

test("color lookup runs shadow to mid to highlight and keeps strand contrast", () => {
  for (const color of HAIR_COLORS) {
    const lut = hairColorLut(color);
    assert.equal(lut.length, 256 * 3);
    assert.deepEqual([...lut.slice(0, 3)], hexToRgb(color.shadow));
    assert.deepEqual([...lut.slice(255 * 3, 255 * 3 + 3)], hexToRgb(color.highlight));
    const sum = (i) => lut[i * 3] + lut[i * 3 + 1] + lut[i * 3 + 2];
    for (let i = 1; i < 256; i += 1) assert.ok(sum(i) >= sum(i - 1), `${color.id} brightens at ${i}`);
    assert.ok(sum(255) - sum(0) > 150, `${color.id} keeps highlights and shadows`);
  }
  const pink = hairColorLut(HAIR_COLORS.find((color) => color.id === "pink"));
  const mid = [...pink.slice(128 * 3, 128 * 3 + 3)];
  assert.ok(mid[0] > mid[1] + 60, "pink mid tone is clearly pink");
});

test("tinting recolors gray pixels and leaves alpha alone", () => {
  const color = HAIR_COLORS.find((item) => item.id === "auburn");
  const lut = hairColorLut(color);
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 128, 128, 128, 90, 255, 255, 255, 255, 200, 200, 200, 0]);
  tintHairPixels(pixels, lut);
  assert.deepEqual([...pixels.slice(0, 4)], [...hexToRgb(color.shadow), 255]);
  assert.equal(pixels[7], 90);
  assert.deepEqual([...pixels.slice(8, 12)], [...hexToRgb(color.highlight), 255]);
  assert.deepEqual([...pixels.slice(12, 16)], [200, 200, 200, 0]);
});

test("frame pivots on the face center and stretches around it", () => {
  const frame = hairFrame(300, 400, {
    x: 0.5,
    y: 0.45,
    scale: 1,
    stretchX: 1.2,
    stretchY: 0.8,
    rotation: 12,
  });
  const unit = (300 * 0.86) / 400;
  assert.equal(frame.w, HAIR_VIEW_W * unit * 1.2);
  assert.equal(frame.h, HAIR_VIEW_H * unit * 0.8);
  assert.equal(frame.cx, 150);
  assert.equal(frame.cy, 180);
  assert.equal(frame.rotation, 12);
  assert.equal(frame.anchorX, HAIR_FACE.cx / HAIR_VIEW_W);
  assert.equal(frame.anchorY, HAIR_FACE.cy / HAIR_VIEW_H);
  assert.ok(Math.abs(frame.left + frame.anchorX * frame.w - frame.cx) < 1e-9);
  assert.ok(Math.abs(frame.top + frame.anchorY * frame.h - frame.cy) < 1e-9);
  // Face opening keeps the same on-screen size as earlier builds.
  const plain = hairFrame(300, 400, { x: 0.5, y: 0.45 });
  assert.ok(Math.abs((plain.w / HAIR_VIEW_W) * HAIR_FACE.rx * 2 - 156 * unit) < 1e-9);
});

test("default placement and photo contain", () => {
  const placement = defaultHairPlacement();
  assert.equal(placement.styleId, "bob");
  assert.equal(placement.x, 0.5);
  assert.equal(placement.y, 0.45);
  assert.equal(placement.stretchX, 1);
  assert.equal(placement.stretchY, 1);
  assert.equal(placement.lift, 0);
  assert.equal(placement.pushBack, false);
  assert.equal(placement.modelId, null);
  const fitted = containRect(300, 400, 480, 640);
  assert.equal(fitted.w, 300);
  assert.equal(fitted.h, 400);
  assert.equal(fitted.x, 0);
  assert.equal(fitted.y, 0);
});

test("twelve practice models, two per face shape, same size and small", async () => {
  assert.deepEqual(FACE_SHAPES.map((shape) => shape.label), ["Oval", "Round", "Square", "Heart", "Long (Oblong)", "Diamond"]);
  assert.equal(HAIR_MODELS.length, 12);
  for (const shape of FACE_SHAPES) {
    assert.deepEqual(HAIR_MODELS.filter((model) => model.shape === shape.id).map((model) => model.who), ["Woman", "Man"]);
  }
  for (const model of HAIR_MODELS) {
    assert.equal(hairModelById(model.id), model);
    const url = new URL(`../${model.src}`, import.meta.url);
    const info = await stat(url);
    assert.ok(info.size < 200 * 1024, `${model.src} is ${info.size} bytes`);
    const buffer = await readFile(url);
    assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  }
  assert.equal(hairModelById("nobody"), null);
});

test("vendored face model is local and licensed", async () => {
  const base = new URL("../assets/vendor/mediapipe/", import.meta.url);
  const license = await readFile(new URL("LICENSE", base), "utf8");
  assert.match(license, /Apache License/);
  for (const file of ["vision_bundle.mjs", "wasm/vision_wasm_internal.js", "wasm/vision_wasm_internal.wasm", "face_landmarker.task"]) {
    assert.ok((await stat(new URL(file, base))).size > 1000, file);
  }
  const fit = await readFile(new URL("../js/face-fit.js", import.meta.url), "utf8");
  assert.doesNotMatch(fit, /https?:\/\//, "face fit loads nothing from the network");
  const bundle = await readFile(new URL("vision_bundle.mjs", base), "utf8");
  assert.doesNotMatch(bundle, /sourceMappingURL/);
  // MediaPipe's usage logging (POST to odml.pa.googleapis.com) is switched off.
  assert.ok(bundle.includes("flush(t,e){this.i=[];t?.();return;"), "logging flush is a no-op");
  assert.doesNotMatch(bundle, /setInterval\(\(\)=>\{this\.flush\(\)\},6e4\)/);
});

test("app name and footer stay put", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /Try-On/i);
  assert.match(app, /© 2026 WingsCrew\. All rights reserved\./);
  assert.match(app, /Pick a model/);
  assert.doesNotMatch(app, /sample-face\.svg|Use a sample face/);
});

test("hairline lift moves the hair along the tilted face", () => {
  const level = hairFrame(300, 400, { x: 0.5, y: 0.45, lift: 10 });
  const unit = (300 * 0.86) / 400;
  assert.ok(Math.abs(level.cy - (180 + 10 * unit)) < 1e-9);
  assert.equal(level.cx, 150);
  const capped = hairFrame(300, 400, { x: 0.5, y: 0.45, lift: 500 });
  assert.ok(Math.abs(capped.cy - (180 + HAIR_LIFT_RANGE * unit)) < 1e-9);
  const tilted = hairFrame(300, 400, { x: 0.5, y: 0.45, lift: 10, rotation: 90 });
  assert.ok(Math.abs(tilted.cx - (150 - 10 * unit)) < 1e-9);
  assert.ok(Math.abs(tilted.cy - 180) < 1e-9);
});

test("face points come from the MediaPipe mesh", () => {
  const mesh = Array.from({ length: 478 }, (_, i) => ({ x: i / 1000, y: 1 - i / 1000 }));
  const points = facePointsFromLandmarks(mesh);
  for (const [name, index] of Object.entries(FACE_POINTS)) assert.deepEqual(points[name], mesh[index]);
  assert.equal(points.oval.length, FACE_OVAL.length);
  assert.deepEqual(points.oval[0], mesh[10]);
  assert.equal(facePointsFromLandmarks([]), null);
  assert.equal(facePointsFromLandmarks(null), null);
});

/** Where the style's face opening lands on the stage for a placement. */
function openingOnStage(stageW, stageH, placement, style) {
  const frame = hairFrame(stageW, stageH, placement);
  const k = frame.w / HAIR_VIEW_W;
  const ky = frame.h / HAIR_VIEW_H;
  const rad = (frame.rotation * Math.PI) / 180;
  const map = (vx, vy) => {
    const dx = (vx - HAIR_FACE.cx) * k;
    const dy = (vy - HAIR_FACE.cy) * ky;
    return { x: frame.cx + dx * Math.cos(rad) - dy * Math.sin(rad), y: frame.cy + dx * Math.sin(rad) + dy * Math.cos(rad) };
  };
  return {
    hairline: map(HAIR_FACE.cx, style.face.top),
    chin: map(HAIR_FACE.cx, style.face.chin),
    width: 2 * style.face.halfW * k,
  };
}

function synthetic({ cx = 0.5, cy = 0.5, size = 0.3, tilt = 0 } = {}) {
  const rad = (tilt * Math.PI) / 180;
  const at = (dx, dy) => ({ x: cx + dx * Math.cos(rad) - dy * Math.sin(rad), y: cy + dx * Math.sin(rad) + dy * Math.cos(rad) });
  return {
    brow: at(0, -0.1 * size),
    noseBase: at(0, 0.18 * size),
    chin: at(0, 0.5 * size),
    left: at(-0.45 * size, 0.05 * size),
    right: at(0.45 * size, 0.05 * size),
    eyeLeft: at(-0.2 * size, 0),
    eyeRight: at(0.2 * size, 0),
  };
}

test("auto-fit centers the face between hairline and chin, keeps the style's shape, and matches tilt", () => {
  const style = HAIR_STYLES.find((item) => item.id === "bob");
  for (const tilt of [0, 9, -14]) {
    const points = synthetic({ cx: 0.47, cy: 0.52, size: 0.4, tilt });
    const stage = { imageW: 800, imageH: 800, stageW: 400, stageH: 400 };
    const fit = fitHairToFace(points, stage, style);
    assert.ok(fit, `fit at ${tilt}°`);
    assert.ok(Math.abs(fit.rotation - tilt) < 1e-6, `rotation ${fit.rotation} vs ${tilt}`);
    assert.equal(fit.stretchX, 1);
    assert.equal(fit.stretchY, 1, "no squash: size comes from the head");
    assert.equal(fit.contour.length, CONTOUR_STEPS);
    const placed = openingOnStage(400, 400, { ...defaultHairPlacement(), ...fit }, style);
    // Brow-to-chin is 0.6 * size; the hairline sits HEAD.hairline of that above the brow.
    const bc = 0.6 * 0.4;
    const rad = (tilt * Math.PI) / 180;
    const along = (d) => ({ x: (0.47 - Math.sin(rad) * d) * 400, y: (0.52 + Math.cos(rad) * d) * 400 });
    const hairline = along(-0.1 * 0.4 - HEAD.hairline * bc);
    const chin = along(0.5 * 0.4);
    const mid = { x: (hairline.x + chin.x) / 2, y: (hairline.y + chin.y) / 2 };
    const placedMid = { x: (placed.hairline.x + placed.chin.x) / 2, y: (placed.hairline.y + placed.chin.y) / 2 };
    assert.ok(Math.hypot(placedMid.x - mid.x, placedMid.y - mid.y) < 0.5, `opening centered at ${tilt}°`);
    const len = Math.hypot(placed.chin.x - placed.hairline.x, placed.chin.y - placed.hairline.y);
    const want = Math.hypot(chin.x - hairline.x, chin.y - hairline.y);
    assert.ok(Math.abs(len / want - 1) < 0.01, `opening height ${len} vs ${want}`);
  }
  assert.equal(fitHairToFace(null, { imageW: 1, imageH: 1, stageW: 1, stageH: 1 }, style), null);
  const flat = synthetic({ size: 0 });
  assert.equal(fitHairToFace(flat, { imageW: 600, imageH: 800, stageW: 300, stageH: 400 }, style), null);
});

test("no crown press-down: the top is a smooth dome a little above the skull", () => {
  const stage = { imageW: 800, imageH: 800, stageW: 400, stageH: 400 };
  const points = synthetic({ cx: 0.5, cy: 0.52, size: 0.4 });
  for (const style of HAIR_STYLES) {
    const fit = fitHairToFace(points, stage, style);
    assert.equal(fit.topScale, undefined, "v15 press-down is gone");
    const face = style.face;
    assert.ok(fit.crownTop > HAIR_FACE.cy - face.top, `${style.id} crown sits above the hairline`);
    // A tall source crown gets thinned to an ellipse; the outer edge stays round (no flat top).
    const ring = fit.contour;
    const outer = ring.map((_, i) => openingRadius(face, (i / ring.length) * Math.PI * 2) + 70);
    const thin = domeThinning(face, ring, outer, fit.crownTop);
    assert.equal(thin.length, ring.length);
    assert.ok(thin.every((c) => c >= MIN_CROWN - 1e-9 && c <= 1), `${style.id} thinning range`);
    const n = ring.length;
    const outR = (i) => ring[i] + (outer[i] - openingRadius(face, (i / n) * Math.PI * 2)) * thin[i];
    const top = outR(n * 0.75);
    assert.ok(Math.abs(top - Math.max(fit.crownTop, ring[n * 0.75] + 6)) < 0.25 * fit.crownTop, `${style.id} top near the dome (${top.toFixed(0)} vs ${fit.crownTop})`);
    // Round, not boxy: the 45-degree shoulders of the dome sit well inside the corners of a box.
    const box = Math.hypot(outR(0), top);
    assert.ok(outR(n * 0.625) < 0.95 * box && outR(n * 0.875) < 0.95 * box, `${style.id} dome shoulders are rounded`);
    assert.equal(thin[0], 1, "no thinning at ear level");
  }
});

test("turned heads: the far side of the skull is covered, the near side hugs the cheek", () => {
  const face = HAIR_STYLES.find((item) => item.id === "pixie").face;
  const outline = [];
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    const ry = Math.sin(a) < 0 ? HAIR_FACE.cy - face.top : face.chin - HAIR_FACE.cy;
    outline.push({ x: HAIR_FACE.cx + Math.cos(a) * face.halfW, y: HAIR_FACE.cy + Math.sin(a) * ry });
  }
  const level = headContour(outline, HAIR_FACE.cy, face.top, 0);
  const turned = headContour(outline, HAIR_FACE.cy, face.top, 0.8); // nose toward +x
  assert.ok(contourRadius(turned, Math.PI) > contourRadius(level, Math.PI) * 1.5, "far side widens");
  assert.equal(contourRadius(turned, 0), contourRadius(level, 0), "near side unchanged");
  assert.ok(contourRadius(turned, Math.PI / 2) === contourRadius(level, Math.PI / 2), "chin unchanged");
  // Between the face edge and the skull edge, the hair's inner band is stretched over the gap (no bald patch).
  const rFace = contourRadius(level, Math.PI);
  const rSkull = contourRadius(turned, Math.PI);
  const mid = warpSource(HAIR_FACE.cx - (rFace + rSkull) / 2, HAIR_FACE.cy, face, turned, 1, level);
  const back = HAIR_FACE.cx - mid.x;
  assert.ok(back > openingRadius(face, Math.PI) && back < openingRadius(face, Math.PI) + 20, `reads hair just outside the opening (${back})`);
  // Fit on the turned fixture faces reports the yaw sign and widens the far side.
  for (const name of ["turned-woman", "turned-tilted-man"]) {
    const f = FACES[name];
    const fit = fitHairToFace(f.points, { imageW: f.imageW, imageH: f.imageH, stageW: 342, stageH: 456 }, HAIR_STYLES[0]);
    assert.ok(Math.abs(fit.yaw) > 0.1, `${name} yaw ${fit.yaw}`);
    assert.ok(Array.isArray(fit.faceContour));
  }
});

test("dimensional color: balayage lightens the ends, rooted darkens the roots, highlights streak", () => {
  assert.deepEqual(finishAmount("solid", 0.5, 0.5), { light: 0, dark: 0 });
  assert.ok(finishAmount("balayage", 0.5, 0.95).light > 0.5 && finishAmount("balayage", 0.5, 0.1).light === 0);
  assert.ok(finishAmount("rooted", 0.5, 0.02).dark > 0.7 && finishAmount("rooted", 0.5, 0.6).dark === 0);
  const lit = Array.from({ length: 200 }, (_, i) => finishAmount("highlights", i / 200, 0.5).light);
  const share = lit.filter((v) => v > 0.3).length / lit.length;
  assert.ok(share > 0.15 && share < 0.6, `streaks cover ${share}`);
  assert.deepEqual(HAIR_FINISHES.map((f) => f.id), ["solid", "balayage", "highlights", "rooted"]);
  // On a real mask: a 1-wide column of hair, top to bottom.
  const color = HAIR_COLORS.find((c) => c.id === "dark-brown");
  const make = () => {
    const d = new Uint8ClampedArray(20 * 4);
    for (let i = 0; i < 20; i += 1) d.set([90, 70, 55, 255], i * 4);
    return d;
  };
  const mask = new Float32Array(20).fill(1);
  const lum = (d, i) => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  const solid = recolorHairPixels(make(), mask, hairColorLut(color), { width: 1, finish: "solid", color });
  const bal = recolorHairPixels(make(), mask, hairColorLut(color), { width: 1, finish: "balayage", color });
  const root = recolorHairPixels(make(), mask, hairColorLut(color), { width: 1, finish: "rooted", color });
  assert.ok(lum(bal, 19) > lum(solid, 19) + 20, "ends lighter");
  assert.ok(Math.abs(lum(bal, 0) - lum(solid, 0)) < 1, "roots unchanged");
  assert.ok(lum(root, 0) < lum(solid, 0), "roots darker");
  assert.ok(Math.abs(lum(root, 19) - lum(solid, 19)) < 1, "ends unchanged");
});

test("head contour: the warp maps the style's opening onto the real head outline", () => {
  const face = HAIR_STYLES.find((item) => item.id === "pixie").face;
  // A narrow head: 70% of the opening's width, same height.
  const outline = [];
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    const ry = Math.sin(a) < 0 ? HAIR_FACE.cy - face.top : face.chin - HAIR_FACE.cy;
    outline.push({ x: HAIR_FACE.cx + Math.cos(a) * face.halfW * 0.7, y: HAIR_FACE.cy + Math.sin(a) * ry });
  }
  const ring = headContour(outline, HAIR_FACE.cy, face.top);
  assert.equal(ring.length, CONTOUR_STEPS);
  assert.ok(Math.abs(contourRadius(ring, 0) - face.halfW * 0.7) < 1, "side radius follows the head");
  assert.ok(Math.abs(contourRadius(ring, Math.PI * 1.5) - (HAIR_FACE.cy - face.top)) < 1, "top reaches the hairline");
  // The opening's edge lands on the head outline, so the inner edge hugs the head.
  for (const a of [0, Math.PI / 4, Math.PI, Math.PI * 1.25, Math.PI * 1.5]) {
    const r = contourRadius(ring, a);
    const src = warpSource(HAIR_FACE.cx + Math.cos(a) * r, HAIR_FACE.cy + Math.sin(a) * r, face, ring, 1);
    const back = Math.hypot(src.x - HAIR_FACE.cx, src.y - HAIR_FACE.cy);
    assert.ok(Math.abs(back - openingRadius(face, a)) < 0.5, `edge at ${a.toFixed(2)}`);
  }
  // Hair 30 units out from the opening stays 30 units out from the head (not wider than the head).
  const out = warpSource(HAIR_FACE.cx + face.halfW * 0.7 + 30, HAIR_FACE.cy, face, ring, 1);
  assert.ok(Math.abs(out.x - (HAIR_FACE.cx + face.halfW + 30)) < 1);
  // The mesh stops short of the hairline: raise the forehead to meet it.
  const low = outline.map((p) => (p.y < HAIR_FACE.cy ? { x: p.x, y: HAIR_FACE.cy - (HAIR_FACE.cy - p.y) * 0.8 } : p));
  const raised = headContour(low, HAIR_FACE.cy, face.top);
  assert.ok(Math.abs(contourRadius(raised, Math.PI * 1.5) - (HAIR_FACE.cy - face.top)) < 1);
});

test("auto-fit on every model and the tilted test faces lands inside the face", () => {
  const stageW = 342;
  const stageH = 456;
  assert.ok(Object.keys(FACES).length >= 14);
  for (const [name, face] of Object.entries(FACES)) {
    if (name.startsWith("turned")) continue; // strongly turned heads are checked in their own test
    const p = face.points;
    const fitted = containRect(stageW, stageH, face.imageW, face.imageH);
    const at = (pt) => ({ x: fitted.x + pt.x * fitted.w, y: fitted.y + pt.y * fitted.h });
    const tilt = (Math.atan2(at(p.eyeRight).y - at(p.eyeLeft).y, at(p.eyeRight).x - at(p.eyeLeft).x) * 180) / Math.PI;
    const faceW = Math.hypot(at(p.right).x - at(p.left).x, at(p.right).y - at(p.left).y);
    for (const style of HAIR_STYLES) {
      const fit = fitHairToFace(p, { imageW: face.imageW, imageH: face.imageH, stageW, stageH }, style);
      assert.ok(fit, `${name} ${style.id}`);
      assert.ok(Math.abs(fit.rotation - tilt) < 1e-6);
      const placed = openingOnStage(stageW, stageH, { ...defaultHairPlacement(), ...fit }, style);
      const brow = at(p.brow);
      const chin = at(p.chin);
      // Hairline above the brow, chin of the opening on the chin, width close to the cheeks.
      const rad = (tilt * Math.PI) / 180;
      const up = (a, b) => (b.x - a.x) * Math.sin(rad) - (b.y - a.y) * Math.cos(rad);
      assert.ok(up(brow, placed.hairline) > 0.1 * faceW, `${name} ${style.id} hairline above brow`);
      assert.ok(up(brow, placed.hairline) < 0.6 * faceW, `${name} ${style.id} hairline not too high`);
      assert.ok(Math.hypot(placed.chin.x - chin.x, placed.chin.y - chin.y) < 0.12 * faceW, `${name} ${style.id} chin`);
      assert.equal(fit.stretchY, 1, `${name} ${style.id} keeps its shape`);
      assert.equal(fit.stretchX, 1, `${name} ${style.id} stretch`);
      // The head outline from the mesh: about as wide as the face, never a helmet.
      const unit = Math.hypot(placed.chin.x - placed.hairline.x, placed.chin.y - placed.hairline.y) / (style.face.chin - style.face.top);
      const sides = (contourRadius(fit.contour, 0) + contourRadius(fit.contour, Math.PI)) * unit;
      assert.ok(sides / faceW > 0.9 && sides / faceW < 1.15, `${name} ${style.id} head width ${(sides / faceW).toFixed(2)}`);
      const top = contourRadius(fit.contour, Math.PI * 1.5);
      assert.ok(Math.abs(top - (HAIR_FACE.cy - style.face.top)) < 2, `${name} ${style.id} outline reaches the hairline`);
    }
  }
});

test("push back clears an oval over the forehead only", () => {
  const style = HAIR_STYLES.find((item) => item.id === "shag");
  const oval = pushBackOval(840, 1200, style);
  const k = 840 / HAIR_VIEW_W;
  assert.equal(oval.cx, HAIR_FACE.cx * k);
  assert.equal(oval.cy, HAIR_FACE.cy * k);
  assert.ok(oval.cy - oval.ry < style.face.top * k, "reaches past the hairline");
  assert.ok(oval.rx > HAIR_FACE.rx * k && oval.rx < HAIR_FACE.rx * 1.1 * k);
  assert.ok(oval.feather > 0);
});
