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
      { kind: "lip", color: "rgba(168, 36, 72, 0.92)", dx: 0, dy: 0.08, scale: 0.07 },
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
      { kind: "lip", color: "rgba(154, 16, 48, 0.95)", dx: 0, dy: 0.08, scale: 0.072 },
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

/**
 * Face-space offsets are scaled down on full-body poses.
 * Vertical scale is smaller than horizontal because the head is a short slice of a tall photo.
 */
export function slotMetrics(slot) {
  if (slot === "face" || slot === "demo-face") return { mx: 1, my: 1, anchor: { x: 0.5, y: 0.435 }, size: 1 };
  if (slot === "side" || slot === "demo-side") return { mx: 0.34, my: 0.28, anchor: { x: 0.57, y: 0.172 }, size: 0.32 };
  if (slot === "front" || slot === "demo-front") return { mx: 0.28, my: 0.28, anchor: { x: 0.5, y: 0.172 }, size: 0.26 };
  return { mx: 0.3, my: 0.22, anchor: { x: 0.5, y: 0.2 }, size: 0.3 };
}

export function buildStamps(presetId, slot) {
  const preset = getPreset(presetId);
  const { mx, my, anchor, size } = slotMetrics(slot);
  return preset.stamps.map((stamp, index) => ({
    id: uid("stamp"),
    kind: "stamp",
    stampKind: stamp.kind,
    color: stamp.color,
    name: STAMP_NAMES[stamp.kind] || "Makeup",
    x: clamp(anchor.x + stamp.dx * mx, 0.02, 0.98),
    y: clamp(anchor.y + stamp.dy * my, 0.02, 0.96),
    scale: stamp.scale * size,
    rotation: 0,
    flip: 1,
    z: 200 + index,
  }));
}
