import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  FACE_POINTS,
  FACE_SHAPES,
  HAIR_COLORS,
  HAIR_FACE,
  HAIR_GROUPS,
  HAIR_LIFT_RANGE,
  HAIR_MODELS,
  HAIR_STYLES,
  HAIR_VIEW_H,
  HAIR_VIEW_W,
  containRect,
  defaultHairPlacement,
  facePointsFromLandmarks,
  fitHairToFace,
  hairColorLut,
  hairFrame,
  hairModelById,
  hexToRgb,
  pushBackOval,
  tintHairPixels,
} from "../js/hair.js";

const SALON_NAMES = {
  short: ["Textured Pixie", "Classic Taper", "Textured Crop / Buzz Cut", "High-Top Fade"],
  medium: ["Chin-Length Blunt Bob", "Collarbone Lob", "Curtain Bangs Shag", "Wolf Cut"],
  long: ["Long Sleek Layers", "Beach Waves", "Silk Press", "Sleek High Bun"],
  textured: ["Defined Curls", "Natural Afro", "Knotless Box Braids", "Starter Locs / Shoulder Locs"],
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

test("sixteen salon hairstyles in four groups and six labeled colors", () => {
  assert.equal(HAIR_STYLES.length, 16);
  assert.equal(new Set(HAIR_STYLES.map((style) => style.id)).size, 16);
  assert.equal(new Set(HAIR_STYLES.map((style) => style.src)).size, 16);
  assert.deepEqual(HAIR_GROUPS.map((group) => group.label), ["Short", "Medium", "Long", "Textured"]);
  for (const group of HAIR_GROUPS) {
    assert.deepEqual(HAIR_STYLES.filter((style) => style.group === group.id).map((style) => style.label), SALON_NAMES[group.id]);
  }
  for (const style of HAIR_STYLES) {
    assert.match(style.src, /^assets\/hair\/[a-z-]+\.webp$/);
    assert.ok(style.face.chin > style.face.top && style.face.halfW > 40, `${style.id} has face-opening metadata`);
  }
  assert.deepEqual(HAIR_COLORS.map((color) => color.label), [
    "Black",
    "Dark Brown",
    "Light Brown",
    "Blonde",
    "Auburn",
    "Pink",
  ]);
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

test("service worker precaches every hairstyle at the new version", async () => {
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(sw, /wingscrew-looks-v14/);
  assert.match(sw, /app\.js\?v=14/);
  assert.match(sw, /hair\.js\?v=3/);
  assert.match(html, /app\.js\?v=14/);
  for (const style of HAIR_STYLES) assert.ok(sw.includes(`./${style.src}`), style.src);
  for (const model of HAIR_MODELS) assert.ok(sw.includes(`./${model.src}`), model.src);
  for (const file of ["vision_bundle.mjs", "wasm/vision_wasm_internal.wasm", "face_landmarker.task"]) {
    assert.ok(sw.includes(`./assets/vendor/mediapipe/${file}`), file);
  }
  assert.doesNotMatch(sw, /sample-face|assets\/hair\/[a-z-]+\.svg/);
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

test("auto-fit puts the hairline on the forehead and matches tilt and width", () => {
  const style = HAIR_STYLES.find((item) => item.id === "bob");
  for (const tilt of [0, 9, -14]) {
    const points = synthetic({ cx: 0.47, cy: 0.52, size: 0.4, tilt });
    const stage = { imageW: 800, imageH: 800, stageW: 400, stageH: 400 };
    const fit = fitHairToFace(points, stage, style);
    assert.ok(fit, `fit at ${tilt}°`);
    assert.ok(Math.abs(fit.rotation - tilt) < 1e-6, `rotation ${fit.rotation} vs ${tilt}`);
    const placed = openingOnStage(400, 400, { ...defaultHairPlacement(), ...fit }, style);
    // Facial thirds: hairline sits one nose-to-chin length above the brow.
    const lower = 0.32 * 0.4;
    const rad = (tilt * Math.PI) / 180;
    const expectHair = { x: (0.47 + Math.sin(rad) * (0.1 * 0.4 + lower)) * 400, y: (0.52 - Math.cos(rad) * (0.1 * 0.4 + lower)) * 400 };
    // Square image in a square stage, so 0..1 maps straight onto the stage.
    assert.ok(Math.hypot(placed.hairline.x - expectHair.x, placed.hairline.y - expectHair.y) < 0.5, `hairline at ${tilt}°`);
    const expectChin = { x: (0.47 - Math.sin(rad) * 0.5 * 0.4) * 400, y: (0.52 + Math.cos(rad) * 0.5 * 0.4) * 400 };
    assert.ok(Math.hypot(placed.chin.x - expectChin.x, placed.chin.y - expectChin.y) < 0.5, `chin at ${tilt}°`);
  }
  assert.equal(fitHairToFace(null, { imageW: 1, imageH: 1, stageW: 1, stageH: 1 }, style), null);
  const flat = synthetic({ size: 0 });
  assert.equal(fitHairToFace(flat, { imageW: 600, imageH: 800, stageW: 300, stageH: 400 }, style), null);
});

test("auto-fit on every model and the tilted test faces lands inside the face", () => {
  const stageW = 342;
  const stageH = 456;
  assert.ok(Object.keys(FACES).length >= 14);
  for (const [name, face] of Object.entries(FACES)) {
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
      assert.ok(Math.hypot(placed.chin.x - chin.x, placed.chin.y - chin.y) < 0.05 * faceW, `${name} ${style.id} chin`);
      const ratio = placed.width / faceW;
      assert.ok(ratio > 0.85 && ratio < 1.02, `${name} ${style.id} width ratio ${ratio}`);
      assert.ok(fit.stretchX > 0.6 && fit.stretchX < 1.2, `${name} ${style.id} stretch ${fit.stretchX}`);
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
