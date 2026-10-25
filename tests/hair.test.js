import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HAIR_COLORS,
  HAIR_STYLES,
  colorizeHairSvg,
  containRect,
  defaultHairPlacement,
  hairFrame,
  hairShades,
} from "../js/hair.js";

function rgbSum(hex) {
  const h = hex.replace("#", "");
  return (
    Number.parseInt(h.slice(0, 2), 16) +
    Number.parseInt(h.slice(2, 4), 16) +
    Number.parseInt(h.slice(4, 6), 16)
  );
}

test("eight hairstyles and six labeled colors", () => {
  assert.equal(HAIR_STYLES.length, 8);
  assert.equal(new Set(HAIR_STYLES.map((style) => style.id)).size, 8);
  for (const style of HAIR_STYLES) {
    assert.match(style.src, /^assets\/hair\/.+\.svg$/);
    assert.ok(style.label);
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

test("shades keep one base and derive a darker and lighter color", () => {
  const black = hairShades("#1a1412");
  const blonde = hairShades("#e2c07a");
  assert.equal(black.base, "#1a1412");
  assert.notEqual(black.dark, black.base);
  assert.notEqual(black.light, black.base);
  assert.ok(rgbSum(black.dark) < rgbSum(black.base));
  assert.ok(rgbSum(black.light) > rgbSum(black.base));
  assert.notEqual(black.base, blonde.base);
  assert.notEqual(black.dark, blonde.dark);
});

test("each hairstyle file is one drawing recolored by CSS variables", async () => {
  for (const style of HAIR_STYLES) {
    const text = await readFile(new URL(`../${style.src}`, import.meta.url), "utf8");
    assert.match(text, /var\(--hair-base\)/);
    assert.match(text, /var\(--hair-dark\)/);
    assert.match(text, /var\(--hair-light\)/);
    assert.match(text, /viewBox="0 0 400 560"/);
    assert.match(text, /a78 96 0 1 0 156 0/);
    assert.match(text, /clip-rule="evenodd"/);
    const local = text.replaceAll("http://www.w3.org/2000/svg", "");
    assert.doesNotMatch(local, /https?:\/\//);
    assert.equal(text.includes("fill=\"#"), false);
    const colored = colorizeHairSvg(text, hairShades("#8f2d1f"));
    assert.equal(colored.includes("var(--hair-"), false);
    assert.match(colored, /#8f2d1f/);
    assert.match(colored, /width="400"/);
  }
});

test("frame math stretches width and height around the stage center", () => {
  const frame = hairFrame(300, 400, {
    x: 0.5,
    y: 0.46,
    scale: 1,
    stretchX: 1.2,
    stretchY: 0.8,
    rotation: 12,
  });
  const baseW = 300 * 0.86;
  assert.equal(frame.w, baseW * 1.2);
  assert.equal(frame.h, baseW * (560 / 400) * 0.8);
  assert.equal(frame.cx, 150);
  assert.equal(frame.cy, 184);
  assert.equal(frame.rotation, 12);
});

test("default placement and photo contain", () => {
  const placement = defaultHairPlacement();
  assert.equal(placement.styleId, "bob");
  assert.equal(placement.x, 0.5);
  assert.equal(placement.stretchX, 1);
  assert.equal(placement.stretchY, 1);
  const fitted = containRect(300, 400, 480, 640);
  assert.equal(fitted.w, 300);
  assert.equal(fitted.h, 400);
  assert.equal(fitted.x, 0);
  assert.equal(fitted.y, 0);
});
