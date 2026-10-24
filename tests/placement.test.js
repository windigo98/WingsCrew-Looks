import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_POSES } from "../js/catalog.js";
import { buildStamps, faceMetrics } from "../js/makeup.js";
import { applyWear, defaultPlacement, needsReseat, normalizeLayers, wearSlot } from "../js/placement.js";

test("full-body clothes start below the chin", () => {
  const face = faceMetrics("demo-front");
  const chin = face.cy + face.ry;
  for (const category of ["top", "outerwear", "bottom", "dress"]) {
    const place = defaultPlacement(category, "demo-front");
    const top = place.y - place.scale / 2;
    assert.ok(top >= chin - 0.005, `${category} top ${top} is above chin ${chin}`);
  }
});

test("a hat rests on the crown and stays above the eyes", () => {
  for (const slot of ["demo-front", "demo-side", "demo-face", "front", "side", "face"]) {
    const face = faceMetrics(slot);
    const hat = defaultPlacement("hat", slot);
    const band = hat.y + (0.51 - 0.5) * hat.scale;
    const brimBottom = hat.y + (0.81 - 0.5) * hat.scale;
    assert.ok(band > face.crown, `${slot} band ${band} is above the hair ${face.crown}`);
    assert.ok(band < face.crown + hat.scale * 0.25, `${slot} band ${band} is snug on ${face.crown}`);
    assert.ok(brimBottom > face.crown + 0.02, `${slot} brim ${brimBottom} overlaps the hair`);
    assert.ok(brimBottom < face.cy - face.ry * 0.2, `${slot} brim covers the eyes`);
    assert.ok(hat.y + hat.scale / 2 < face.cy, `${slot} covers the eyes`);
    assert.ok(hat.scale <= face.ry * 2, slot);
    assert.ok(face.crown < face.cy - face.ry, `${slot} crown is above the face`);
  }
});

test("makeup stamps stay on the face, and unknown poses get none", () => {
  const face = faceMetrics("demo-front");
  for (const id of ["natural", "glam", "bold-lip", "smoky"]) {
    const stamps = buildStamps(id, "demo-front");
    assert.ok(stamps.length > 0, id);
    for (const stamp of stamps) {
      assert.ok(Math.abs(stamp.x - face.cx) <= face.rx + 0.02, `${id} x`);
      assert.ok(Math.abs(stamp.y - face.cy) <= face.ry + 0.02, `${id} y ${stamp.y}`);
    }
  }
  assert.equal(buildStamps("bold-lip", "extra").length, 0);
  assert.equal(faceMetrics("extra"), null);
});

test("a face close-up does not park clothes on the face", () => {
  const face = faceMetrics("demo-face");
  const chin = face.cy + face.ry;
  for (const category of ["top", "bottom", "dress", "outerwear"]) {
    const place = defaultPlacement(category, "demo-face");
    assert.ok(place.y - place.scale / 2 >= chin - 0.02, category);
  }
});

test("demo drawings are the three guided poses", () => {
  assert.deepEqual(DEMO_POSES.map((pose) => pose.slot), ["demo-front", "demo-side", "demo-face"]);
});

test("hats, hoops, pearls, and glasses sit on the face", () => {
  const face = faceMetrics("demo-front");
  const hat = defaultPlacement("hat", "demo-front");
  const band = hat.y + (0.51 - 0.5) * hat.scale;
  assert.ok(band > face.crown && band < face.crown + 0.04, "hat sits on the hair");
  assert.ok(hat.y + hat.scale / 2 < face.cy, "hat covers the eyes");
  assert.ok(hat.scale <= face.ry * 2);

  const hoops = defaultPlacement("jewelry", "demo-front", { name: "Gold hoops", refId: "sample-hoops" });
  assert.equal(wearSlot({ category: "jewelry", name: "Gold hoops", refId: "sample-hoops" }), "ears");
  assert.ok(Math.abs(hoops.y - face.cy) < 0.04);
  assert.ok(hoops.scale <= face.ry * 2);

  const pearls = defaultPlacement("jewelry", "demo-front", { name: "Pearl strand", refId: "sample-pearls" });
  assert.equal(wearSlot({ category: "jewelry", name: "Pearl strand" }), "neck");
  assert.ok(pearls.y - pearls.scale / 2 >= face.cy + face.ry - 0.03);

  const glasses = defaultPlacement("jewelry", "demo-front", { name: "Sun glasses", refId: "sample-glasses" });
  assert.equal(wearSlot({ category: "accessory", name: "Sun glasses" }), "eyes");
  assert.ok(Math.abs(glasses.y - face.cy) < face.ry);
  assert.ok(glasses.scale <= 0.08);
});

function piece(id, refId, name, category) {
  return { id, source: "sample", refId, name, category, kind: "item", rotation: 0, flip: 1 };
}

test("a dress replaces the top and bottom, and a blazer stays over them", () => {
  let layers = [];
  layers = applyWear(layers, piece("top", "sample-blouse", "Ivory blouse", "top"), "demo-front").layers;
  layers = applyWear(layers, piece("jeans", "sample-jeans", "Indigo jeans", "bottom"), "demo-front").layers;
  layers = applyWear(layers, piece("blazer", "sample-blazer", "Ink blazer", "outerwear"), "demo-front").layers;
  assert.equal(layers.filter((layer) => layer.category === "top").length, 1);
  const dressed = applyWear(layers, piece("dress", "sample-midi", "Garden midi", "dress"), "demo-front");
  const categories = dressed.layers.map((layer) => layer.category).sort();
  assert.deepEqual(categories, ["dress", "outerwear"]);
  const blazer = dressed.layers.find((layer) => layer.category === "outerwear");
  const dress = dressed.layers.find((layer) => layer.category === "dress");
  assert.ok(blazer.z > dress.z);
});

test("tapping the same piece again does not add a copy", () => {
  const first = applyWear([], piece("a", "sample-blazer", "Ink blazer", "outerwear"), "demo-front");
  const second = applyWear(first.layers, piece("b", "sample-blazer", "Ink blazer", "outerwear"), "demo-front");
  assert.equal(second.added, false);
  assert.equal(second.selectedId, "a");
  assert.equal(second.layers.length, 1);
});

test("an old piled-up look is reseated to one sensible outfit", () => {
  const pile = [
    piece("b1", "sample-blazer", "Ink blazer", "outerwear"),
    piece("b2", "sample-blazer", "Ink blazer", "outerwear"),
    piece("j1", "sample-jeans", "Indigo jeans", "bottom"),
    piece("j2", "sample-jeans", "Indigo jeans", "bottom"),
    piece("d1", "sample-midi", "Garden midi", "dress"),
    piece("d2", "sample-sundress", "Peach sundress", "dress"),
    piece("hat", "sample-hat", "Straw hat", "hat"),
    piece("pearls", "sample-pearls", "Pearl strand", "jewelry"),
    piece("hoops", "sample-hoops", "Gold hoops", "jewelry"),
  ].map((layer) => ({ ...layer, scale: 1.05, x: 0.5, y: 0.45 }));
  assert.equal(needsReseat({ placementVersion: 2, layers: pile }), true);
  assert.equal(needsReseat({ placementVersion: 3, layers: [{ kind: "item", scale: 0.22, category: "outerwear" }] }), true);
  assert.equal(needsReseat({ placementVersion: 4, layers: [{ kind: "item", scale: 0.22, category: "outerwear" }] }), true);
  assert.equal(needsReseat({ placementVersion: 5, layers: [{ kind: "item", scale: 1.1, category: "top" }] }), true);
  assert.equal(needsReseat({ placementVersion: 5, layers: [{ kind: "item", scale: 0.22, category: "outerwear" }] }), false);

  const face = faceMetrics("demo-front");
  const chin = face.cy + face.ry;
  const out = normalizeLayers(pile, "demo-front");
  const categories = out.map((layer) => wearSlot(layer)).sort();
  assert.deepEqual(categories, ["dress", "ears", "hat", "neck", "outerwear"]);
  for (const layer of out) {
    assert.ok(layer.scale < 0.75, `${layer.name} scale ${layer.scale}`);
    if (layer.category === "dress" || layer.category === "outerwear") {
      assert.ok(layer.y - layer.scale / 2 >= chin - 0.02, layer.name);
    }
  }
});
