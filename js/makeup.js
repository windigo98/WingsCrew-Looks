import { clamp, uid } from "./util.js";

/**
 * Local makeup presets. These are drawing instructions for the on-device painter.
 * A future provider (Perfect Corp, Gemini, or similar) can replace them with a generated image.
 * Offsets are tuned for a face-filling photo, then scaled down for full-body poses.
 */
export const MAKEUP_PRESETS = [
  {
    id: "none",
    name: "None",
    blurb: "Just the photo",
    swatch: "#f3ebe3",
    grade: null,
    vignette: 0,
    stamps: [],
  },
  {
    id: "natural",
    name: "Natural",
    blurb: "Soft warmth",
    swatch: "#e7b49a",
    grade: { blend: "soft-light", color: "rgb(255, 190, 164)", alpha: 0.42 },
    vignette: 0.08,
    stamps: [
      { kind: "blush", color: "rgba(206, 92, 102, 0.62)", dx: -0.13, dy: 0.08, scale: 0.15 },
      { kind: "blush", color: "rgba(206, 92, 102, 0.62)", dx: 0.13, dy: 0.08, scale: 0.15 },
    ],
  },
  {
    id: "glam",
    name: "Glam",
    blurb: "Glow and color",
    swatch: "#e7a0b5",
    grade: { blend: "soft-light", color: "rgb(255, 206, 186)", alpha: 0.55 },
    vignette: 0.14,
    stamps: [
      { kind: "highlight", color: "rgba(255, 246, 224, 0.95)", dx: 0, dy: -0.01, scale: 0.11 },
      { kind: "blush", color: "rgba(214, 78, 116, 0.7)", dx: -0.14, dy: 0.08, scale: 0.16 },
      { kind: "blush", color: "rgba(214, 78, 116, 0.7)", dx: 0.14, dy: 0.08, scale: 0.16 },
      { kind: "lip", color: "rgba(168, 36, 72, 0.92)", dx: 0, dy: 0.145, scale: 0.085 },
    ],
  },
  {
    id: "bold-lip",
    name: "Bold lip",
    blurb: "A strong lip",
    swatch: "#9d2344",
    grade: { blend: "soft-light", color: "rgb(255, 176, 164)", alpha: 0.32 },
    vignette: 0.1,
    stamps: [
      { kind: "lip", color: "rgba(154, 16, 48, 0.95)", dx: 0, dy: 0.15, scale: 0.1 },
    ],
  },
  {
    id: "smoky",
    name: "Smoky eye",
    blurb: "Cool and smoky",
    swatch: "#3c3450",
    grade: { blend: "soft-light", color: "rgb(156, 164, 190)", alpha: 0.48 },
    vignette: 0.42,
    stamps: [
      { kind: "shadow", color: "rgba(42, 34, 58, 0.8)", dx: -0.105, dy: 0.005, scale: 0.12 },
      { kind: "shadow", color: "rgba(42, 34, 58, 0.8)", dx: 0.105, dy: 0.005, scale: 0.12 },
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

/** Where facial features tend to sit for each guided pose. */
export function slotMetrics(slot) {
  if (slot === "face" || slot === "demo-face") return { m: 1, anchor: { x: 0.5, y: 0.435 } };
  if (slot === "side" || slot === "demo-side") return { m: 0.48, anchor: { x: 0.57, y: 0.178 } };
  if (slot === "front" || slot === "demo-front") return { m: 0.4, anchor: { x: 0.5, y: 0.178 } };
  return { m: 0.4, anchor: { x: 0.5, y: 0.22 } };
}

export function buildStamps(presetId, slot) {
  const preset = getPreset(presetId);
  const { m, anchor } = slotMetrics(slot);
  return preset.stamps.map((stamp, index) => ({
    id: uid("stamp"),
    kind: "stamp",
    stampKind: stamp.kind,
    color: stamp.color,
    name: STAMP_NAMES[stamp.kind] || "Makeup",
    x: clamp(anchor.x + stamp.dx * m, 0.02, 0.98),
    y: clamp(anchor.y + stamp.dy * m, 0.02, 0.96),
    scale: stamp.scale * m,
    rotation: 0,
    flip: 1,
    z: 200 + index,
  }));
}
