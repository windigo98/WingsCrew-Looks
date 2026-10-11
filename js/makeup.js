import { clamp, uid } from "./util.js";

/**
 * Local makeup presets. Stamps are drawn on the face only.
 * A future provider can replace apply() with a generated image.
 * dx and dy are offsets in face radii (1 = the edge of the face oval).
 * scale is a fraction of the face height.
 */
export const MAKEUP_PRESETS = [
  {
    id: "none",
    name: "None",
    blurb: "Just the photo",
    swatch: "#f3ebe3",
    grade: null,
    stamps: [],
  },
  {
    id: "natural",
    name: "Natural",
    blurb: "Soft warmth on the cheeks",
    swatch: "#e7b49a",
    grade: { color: "rgb(255, 196, 170)", alpha: 0.28 },
    stamps: [
      { kind: "blush", color: "rgba(206, 92, 102, 0.55)", dx: -0.42, dy: 0.22, scale: 0.26 },
      { kind: "blush", color: "rgba(206, 92, 102, 0.55)", dx: 0.42, dy: 0.22, scale: 0.26 },
    ],
  },
  {
    id: "glam",
    name: "Glam",
    blurb: "Cheek color and a lip",
    swatch: "#e7a0b5",
    grade: { color: "rgb(255, 206, 186)", alpha: 0.22 },
    stamps: [
      { kind: "blush", color: "rgba(214, 78, 116, 0.6)", dx: -0.4, dy: 0.2, scale: 0.28 },
      { kind: "blush", color: "rgba(214, 78, 116, 0.6)", dx: 0.4, dy: 0.2, scale: 0.28 },
      { kind: "lip", color: "rgba(168, 36, 72, 0.92)", dx: 0, dy: 0.64, scale: 0.14 },
    ],
  },
  {
    id: "bold-lip",
    name: "Bold lip",
    blurb: "A strong lip",
    swatch: "#9d2344",
    grade: null,
    stamps: [
      { kind: "lip", color: "rgba(154, 16, 48, 0.95)", dx: 0, dy: 0.64, scale: 0.15 },
    ],
  },
  {
    id: "smoky",
    name: "Smoky eye",
    blurb: "Color on the eyes",
    swatch: "#3c3450",
    grade: null,
    stamps: [
      { kind: "shadow", color: "rgba(42, 34, 58, 0.75)", dx: -0.36, dy: -0.08, scale: 0.18 },
      { kind: "shadow", color: "rgba(42, 34, 58, 0.75)", dx: 0.36, dy: -0.08, scale: 0.18 },
    ],
  },
];

const STAMP_NAMES = {
  blush: "Blush",
  lip: "Lip",
  shadow: "Eye shadow",
  highlight: "Highlight",
};

export function getPreset(id) {
  return MAKEUP_PRESETS.find((preset) => preset.id === id) || MAKEUP_PRESETS[0];
}

/**
 * Where the face sits on a guided pose, as fractions of the photo.
 * null means we do not know, and makeup must not be drawn.
 * Full-body numbers match the demo drawings (chin near 0.29).
 */
export function faceMetrics(slot) {
  if (slot === "face" || slot === "demo-face") return { cx: 0.5, cy: 0.44, rx: 0.24, ry: 0.2 };
  if (slot === "side" || slot === "demo-side") return { cx: 0.6, cy: 0.2, rx: 0.12, ry: 0.08 };
  if (slot === "front" || slot === "demo-front") return { cx: 0.5, cy: 0.1975, rx: 0.16, ry: 0.09 };
  return null;
}

export function hasFaceAnchor(slot) {
  return Boolean(faceMetrics(slot));
}

export function buildStamps(presetId, slot) {
  const preset = getPreset(presetId);
  const face = faceMetrics(slot);
  if (!face || preset.id === "none") return [];
  const faceHeight = face.ry * 2;
  return preset.stamps.map((stamp, index) => ({
    id: uid("stamp"),
    kind: "stamp",
    stampKind: stamp.kind,
    color: stamp.color,
    name: STAMP_NAMES[stamp.kind] || "Makeup",
    x: clamp(face.cx + stamp.dx * face.rx, 0.02, 0.98),
    y: clamp(face.cy + stamp.dy * face.ry, 0.02, 0.98),
    scale: stamp.scale * faceHeight,
    rotation: 0,
    flip: 1,
    z: 200 + index,
  }));
}
