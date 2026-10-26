import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  HAIR_COLORS,
  HAIR_FACE,
  HAIR_STYLES,
  HAIR_VIEW_H,
  HAIR_VIEW_W,
  containRect,
  defaultHairPlacement,
  hairColorLut,
  hairFrame,
  hexToRgb,
  tintHairPixels,
} from "../js/hair.js";

const SALON_NAMES = [
  "Textured Pixie",
  "Chin-Length Blunt Bob",
  "Long Sleek Layers",
  "Beach Waves",
  "Defined Curls",
  "Knotless Box Braids",
  "High-Top Fade",
  "Sleek High Bun",
];

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

test("eight salon hairstyles and six labeled colors", () => {
  assert.equal(HAIR_STYLES.length, 8);
  assert.equal(new Set(HAIR_STYLES.map((style) => style.id)).size, 8);
  assert.deepEqual(HAIR_STYLES.map((style) => style.label), SALON_NAMES);
  for (const style of HAIR_STYLES) assert.match(style.src, /^assets\/hair\/[a-z-]+\.webp$/);
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
  assert.match(sw, /wingscrew-looks-v13/);
  assert.match(sw, /app\.js\?v=13/);
  assert.match(html, /app\.js\?v=13/);
  for (const style of HAIR_STYLES) assert.ok(sw.includes(`./${style.src}`), style.src);
  assert.doesNotMatch(sw, /assets\/hair\/(pixie|bob|curls)\.svg/);
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
  const fitted = containRect(300, 400, 480, 640);
  assert.equal(fitted.w, 300);
  assert.equal(fitted.h, 400);
  assert.equal(fitted.x, 0);
  assert.equal(fitted.y, 0);
});
