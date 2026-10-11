import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_POSES } from "../js/catalog.js";
import { buildStamps, faceMetrics } from "../js/makeup.js";
import { defaultPlacement } from "../js/placement.js";

test("full-body clothes start below the chin", () => {
  const face = faceMetrics("demo-front");
  const chin = face.cy + face.ry;
  for (const category of ["top", "outerwear", "bottom", "dress"]) {
    const place = defaultPlacement(category, "demo-front");
    const top = place.y - place.scale / 2;
    assert.ok(top >= chin - 0.005, `${category} top ${top} is above chin ${chin}`);
  }
});

test("a hat stays above the eyes", () => {
  const face = faceMetrics("demo-front");
  const hat = defaultPlacement("hat", "demo-front");
  assert.ok(hat.y + hat.scale / 2 < face.cy);
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
