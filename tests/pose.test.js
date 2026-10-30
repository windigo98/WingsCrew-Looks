import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { POSE_EASE, POSE_LIMITS, POSE_MESSAGE, defaultHairPlacement, headPose, poseGuard } from "../js/hair.js";

const poses = JSON.parse(await readFile(new URL("./fixtures/head-poses.json", import.meta.url), "utf8"));
const MODELS = ["oval", "round", "square", "heart", "long", "diamond"].flatMap((shape) => [`${shape}-woman`, `${shape}-man`]);
const poseOf = (name, how = "matrix") => {
  const face = poses[name];
  const points = how === "nose" ? Object.fromEntries(Object.entries(face.points).map(([k, p]) => [k, { x: p.x, y: p.y }])) : face.points;
  return headPose(points, { imageW: face.imageW, imageH: face.imageH, matrix: how === "matrix" ? face.matrix : null });
};

/** A column-major 4x4 for a head turned `yaw` degrees and tilted `roll` degrees. */
function matrixFor(yaw, roll = 0) {
  const a = (yaw * Math.PI) / 180;
  const b = (roll * Math.PI) / 180;
  // R = Rz(roll) * Ry(yaw); columns are the rotated axes.
  const ry = [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const rz = [[Math.cos(b), -Math.sin(b), 0], [Math.sin(b), Math.cos(b), 0], [0, 0, 1]];
  const r = rz.map((row) => [0, 1, 2].map((j) => row.reduce((sum, v, k) => sum + v * ry[k][j], 0)));
  const m = new Array(16).fill(0);
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) m[j * 4 + i] = r[i][j];
  m[15] = 1;
  return m;
}

const level = (eyeDeg) => {
  const t = (eyeDeg * Math.PI) / 180;
  const c = { x: 0.5, y: 0.45 };
  const at = (d) => ({ x: c.x + Math.cos(t) * d, y: c.y + Math.sin(t) * d });
  return { eyeLeft: at(-0.1), eyeRight: at(0.1), left: at(-0.2), right: at(0.2), nose: { ...at(0), y: at(0).y + 0.05 } };
};

test("pose limits are modest: about 12 degrees of turn and 10 of tilt, with a gentle band below", () => {
  assert.equal(POSE_LIMITS.yaw, 12);
  assert.equal(POSE_LIMITS.roll, 10);
  assert.ok(POSE_EASE.yaw < POSE_LIMITS.yaw && POSE_EASE.roll < POSE_LIMITS.roll);
  assert.match(POSE_MESSAGE, /facing the camera, head straight/);
});

test("head pose reads yaw from the landmarker matrix and roll from the eye line", () => {
  for (const yaw of [-30, -12, 0, 8, 20]) {
    const pose = headPose(level(0), { imageW: 1, imageH: 1, matrix: matrixFor(yaw) });
    assert.equal(pose.source, "matrix");
    assert.ok(Math.abs(pose.yaw - yaw) < 0.2, `${yaw} -> ${pose.yaw}`);
  }
  for (const roll of [-15, -4, 0, 9]) {
    const pose = headPose(level(roll), { imageW: 1, imageH: 1 });
    assert.ok(Math.abs(pose.roll - roll) < 0.2, `${roll} -> ${pose.roll}`);
  }
  // Roll is measured in pixels, so a non-square picture doesn't skew it.
  const dy = (200 * Math.tan(Math.PI / 18)) / 750;
  const wide = headPose({ eyeLeft: { x: 0.4, y: 0.5 }, eyeRight: { x: 0.6, y: 0.5 + dy }, left: { x: 0.3, y: 0.5 }, right: { x: 0.7, y: 0.5 } }, { imageW: 1000, imageH: 750 });
  assert.ok(Math.abs(wide.roll - 10) < 0.2, String(wide.roll));
  assert.equal(headPose(null), null);
  assert.equal(headPose({ eyeLeft: { x: 0.4, y: 0.5 } }), null);
});

test("the twelve models read as straight-on with every estimate", () => {
  for (const name of MODELS) {
    for (const how of ["matrix", "depth", "nose"]) {
      const pose = poseOf(name, how);
      assert.ok(Math.abs(pose.yaw) < 4 && Math.abs(pose.roll) < 4, `${name} ${how} ${JSON.stringify(pose)}`);
      assert.equal(poseGuard(pose).level, "straight", `${name} ${how}`);
    }
  }
});

test("turned and tilted test faces are caught; small tilts are drawn gracefully", () => {
  const expect = {
    "turned-woman": "turned-tilted",
    "turned-tilted-man": "turned-tilted",
    "turn-a-man": "turned",
    "turn-b-woman": "turned",
    "long-tilt": "tilted",
    "round-tilt-stylized": "tilted",
    "mannequin-roll18": "tilted",
    "roll12-oval-woman": "tilted",
    "roll8-oval-woman": "slight",
    "roll5-oval-woman": "straight",
    "turn-c-woman": "straight",
    "turn-d-man": "turned",
  };
  for (const [name, want] of Object.entries(expect)) {
    const guard = poseGuard(poseOf(name));
    assert.equal(guard.level, want, `${name} ${JSON.stringify(poseOf(name))}`);
    assert.equal(guard.ok, want === "slight" || want === "straight", name);
    if (!guard.ok) assert.equal(guard.message, POSE_MESSAGE);
  }
  // Without the matrix, the depth and nose estimates still catch the clearly turned faces.
  for (const name of ["turned-woman", "turned-tilted-man", "turn-a-man", "turn-b-woman", "turn-d-man"]) {
    for (const how of ["depth", "nose"]) assert.equal(poseGuard(poseOf(name, how)).ok, false, `${name} ${how}`);
  }
});

test("pose guard thresholds and the slight band", () => {
  assert.equal(poseGuard(null).ok, true);
  assert.equal(poseGuard({ yaw: 3, roll: -2 }).level, "straight");
  assert.equal(poseGuard({ yaw: -9, roll: 0 }).level, "slight");
  assert.equal(poseGuard({ yaw: 0, roll: 7 }).ok, true);
  assert.equal(poseGuard({ yaw: 12, roll: 10 }).ok, true, "the limit itself is allowed");
  assert.equal(poseGuard({ yaw: -12.5, roll: 0 }).level, "turned");
  assert.equal(poseGuard({ yaw: 0, roll: -10.5 }).level, "tilted");
  assert.equal(poseGuard({ yaw: 20, roll: 15 }).level, "turned-tilted");
  assert.equal(poseGuard({ yaw: 20, roll: 0 }, { yaw: 25, roll: 10 }).ok, true, "limits can be passed in");
});

test("the app hides a badly fitted overlay, offers Show anyway, and remembers the choice", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../css/app.css", import.meta.url), "utf8");
  const fit = await readFile(new URL("../js/face-fit.js", import.meta.url), "utf8");
  assert.match(fit, /outputFacialTransformationMatrixes: true/);
  assert.match(fit, /headPose\(/);
  assert.match(app, /data-action="hair-pose-show">Show anyway</);
  assert.match(app, /POSE_MESSAGE/);
  assert.match(app, /overlay\.hidden = pose\.blocked/);
  assert.match(app, /poseShown/);
  assert.match(app, /Approximate preview/);
  assert.match(css, /\.hair-pose-guard/);
  const base = defaultHairPlacement();
  assert.equal(base.pose, null);
  assert.equal(base.poseShown, "");
});
