/**
 * On-device hair. Practice models show finished portraits of each cut (made
 * ahead of time, recolored on the phone). Your own photo gets an approximate
 * overlay: a photo-real cutout bent to your head outline. Color is a gradient
 * map, so strand highlights and shadows stay. No network calls.
 */

/** Size of every hair image, in view units. The images are 1.5 px per unit. */
export const HAIR_VIEW_W = 560;
export const HAIR_VIEW_H = 800;

/** The face opening every image shares: an ellipse in view units. */
export const HAIR_FACE = { cx: 280, cy: 250, rx: 78, ry: 96 };

/** View units that span the base frame width (keeps face size from earlier builds). */
const HAIR_BASE_UNITS = 400;

/**
 * Shared face opening, in view units: hairline (`top`), chin, and half the cheek
 * width. `crown` is the top of the hair in the image; `allow` is how far the hair
 * may rise above the top of the skull, as a share of the brow-to-chin length.
 */
const OPENING = { top: 154, chin: 346, halfW: 78, crown: 70, allow: 0.06 };

/** Who a style is shown for. */
export const HAIR_AUDIENCES = [
  { id: "women", label: "Women" },
  { id: "men", label: "Men" },
];

export const HAIR_GROUPS = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
  { id: "up", label: "Updos" },
  { id: "textured", label: "Textured" },
];

function style(id, label, file, group, extra = {}) {
  const { face, ...rest } = extra;
  return { id, label, src: `assets/hair/${file}.webp`, group, bangs: false, for: ["women"], ...rest, face: { ...OPENING, ...(face || {}) } };
}

/**
 * 2026 salon favorites, named the way you'd ask for them. `face` says where the
 * face opening and the crown sit in each image (view units). `bangs` styles have
 * a fringe over the upper forehead. Shoulder Locs is in both sets.
 */
export const HAIR_STYLES = [
  style("bob", "Sleek Chin Bob", "bob", "medium", { for: ["women"], face: { crown: 80, allow: 0.04 } }),
  style("lob", "Italian Lob", "lob", "medium", { for: ["women"], face: { crown: 74, allow: 0.05 } }),
  style("butterfly", "Butterfly Cut", "butterfly", "long", { bangs: true, for: ["women"], face: { crown: 13, allow: 0.1 } }),
  style("straight", "Long Layers", "long-layers", "long", { for: ["women"], face: { crown: 90, allow: 0.04 } }),
  style("blowout", "Bouncy Blowout", "blowout", "long", { for: ["women"], face: { crown: 9, allow: 0.14 } }),
  style("waves", "Beach Waves", "beach-waves", "long", { for: ["women"], face: { crown: 76, allow: 0.07 } }),
  style("silk", "Silk Press", "silk-press", "long", { for: ["women"], face: { crown: 76, allow: 0.03 } }),
  style("curls", "Defined Curls", "curls", "textured", { for: ["women"], face: { crown: 62, allow: 0.14 } }),
  style("braids", "Knotless Braids", "braids", "textured", { for: ["women"], face: { crown: 61, allow: 0.05 } }),
  style("ponytail", "Sleek High Ponytail", "ponytail", "up", { for: ["women"], face: { crown: 52, allow: 0.14 } }),
  style("bun", "High Bun / Chignon", "high-bun", "up", { for: ["women"], face: { crown: 33, allow: 0.3 } }),
  style("pixie", "Textured Pixie", "pixie", "short", { bangs: true, for: ["women"], face: { crown: 45, allow: 0.1 } }),
  style("wolf", "Wolf Cut", "wolf", "medium", { bangs: true, for: ["women"], face: { crown: 13, allow: 0.12 } }),
  style("afro", "Natural Afro", "afro", "textured", { for: ["women"], face: { crown: 4, allow: 0.36 } }),
  style("locs", "Shoulder Locs", "locs", "textured", { for: ["women", "men"], face: { crown: 90, allow: 0.06 } }),
  style("shag", "Wispy Bangs Shag", "shag", "medium", { bangs: true, for: ["women"], face: { crown: 14, allow: 0.1 } }),
  style("crop", "Low Taper + Textured Crop", "crop", "short", { bangs: true, for: ["men"], face: { top: 140, halfW: 84, crown: 81, allow: 0.07 } }),
  style("buzz", "Buzz Cut", "buzz", "short", { for: ["men"], face: { crown: 69, allow: 0.04 } }),
  style("taper", "Classic Side Part", "taper", "short", { for: ["men"], face: { top: 138, crown: 77, allow: 0.08 } }),
  style("comma", "Comma Hair", "comma", "medium", { bangs: true, for: ["men"], face: { crown: 75, allow: 0.06 } }),
  style("twoblock", "Two-Block", "twoblock", "medium", { bangs: true, for: ["men"], face: { crown: 78, allow: 0.06 } }),
  style("softwolf", "Soft Wolf Cut", "softwolf", "medium", { bangs: true, for: ["men"], face: { crown: 70, allow: 0.08 } }),
  style("mullet", "Modern Mullet", "mullet", "medium", { bangs: true, for: ["men"], face: { crown: 77, allow: 0.06 } }),
  style("flow", "Flow (Swept Back)", "flow", "medium", { for: ["men"], face: { crown: 75, allow: 0.06 } }),
  style("fade", "High-Top Fade", "high-top-fade", "short", { for: ["men"], face: { top: 138, crown: 46, allow: 0.32 } }),
  style("waves360", "360 Waves", "waves360", "short", { for: ["men"], face: { crown: 59, allow: 0.04 } }),
  style("curlytop", "Curly Top + Taper", "curlytop", "textured", { bangs: true, for: ["men"], face: { crown: 65, allow: 0.12 } }),
  style("twists", "Two-Strand Twists", "twists", "textured", { bangs: true, for: ["men"], face: { crown: 75, allow: 0.1 } }),
  style("cornrows", "Stitch Braids", "cornrows", "textured", { for: ["men"], face: { crown: 52, allow: 0.05 } }),
];

export function hairStylesFor(audience) {
  // A style's own set first, shared styles (listed under the other set) after.
  const mine = HAIR_STYLES.filter((item) => item.for.includes(audience));
  return [...mine.filter((item) => item.for[0] === audience), ...mine.filter((item) => item.for[0] !== audience)];
}

/**
 * `hex` is the swatch. `shadow`, `mid`, and `highlight` are the gradient map:
 * dark strands take `shadow`, average strands `mid`, shine takes `highlight`.
 */
export const HAIR_COLORS = [
  { id: "black", label: "Jet Black", hex: "#1a1412", shadow: "#0a0808", mid: "#262120", highlight: "#6b625d" },
  { id: "dark-brown", label: "Espresso", hex: "#2e1b13", shadow: "#0e0705", mid: "#3b2318", highlight: "#8c6450" },
  { id: "chestnut", label: "Chestnut", hex: "#5a3220", shadow: "#1c0d07", mid: "#5a3220", highlight: "#a8704c" },
  { id: "light-brown", label: "Light Brown", hex: "#8a5a32", shadow: "#28160b", mid: "#87593a", highlight: "#d9b48c" },
  { id: "caramel", label: "Caramel Honey", hex: "#a8743f", shadow: "#3a2210", mid: "#a26d3c", highlight: "#ebc48e" },
  { id: "blonde", label: "Golden Blonde", hex: "#e2c07a", shadow: "#5b4020", mid: "#c7a46b", highlight: "#fbeccb" },
  { id: "ash-blonde", label: "Ash Blonde", hex: "#c9b89a", shadow: "#4a4236", mid: "#b0a084", highlight: "#ece3d0" },
  { id: "platinum", label: "Platinum", hex: "#ece6d6", shadow: "#8a8478", mid: "#d8d1c0", highlight: "#fffdf6" },
  { id: "copper", label: "Copper", hex: "#b5562a", shadow: "#3a1508", mid: "#b0532a", highlight: "#f0a070" },
  { id: "auburn", label: "Auburn", hex: "#8f2d1f", shadow: "#240b06", mid: "#7f2c18", highlight: "#cf7650" },
  { id: "burgundy", label: "Burgundy", hex: "#6e1a2c", shadow: "#1f050b", mid: "#6a1a2b", highlight: "#b8566a" },
  { id: "silver", label: "Silver Gray", hex: "#b9bcc2", shadow: "#3e4046", mid: "#a6a9b0", highlight: "#f2f3f6" },
  { id: "pink", label: "Rose Pink", hex: "#e56aa6", shadow: "#3d1024", mid: "#c95b8c", highlight: "#fbc3da" },
  { id: "lavender", label: "Lavender", hex: "#b9a2dc", shadow: "#3e3054", mid: "#a690cc", highlight: "#ece2fb" },
];

/**
 * Dimensional color, painted inside the hair: Balayage lightens toward the ends,
 * Highlights add fine lighter streaks, Rooted keeps darker roots.
 */
export const HAIR_FINISHES = [
  { id: "solid", label: "All over" },
  { id: "balayage", label: "Balayage" },
  { id: "highlights", label: "Highlights" },
  { id: "rooted", label: "Rooted" },
];

export function hairFinishById(id) {
  return HAIR_FINISHES.find((item) => item.id === id) || HAIR_FINISHES[0];
}

const LIGHT_BASES = new Set(["blonde", "ash-blonde", "platinum", "silver", "pink", "lavender", "caramel"]);

/** The lighter shade a finish lifts toward, and the darker one roots fall to. */
export function finishShades(color) {
  const lift = LIGHT_BASES.has(color.id)
    ? { id: "lift-light", shadow: "#9a9282", mid: "#e6dfcf", highlight: "#fffdf8" }
    : { id: "lift-honey", shadow: "#4a2e16", mid: "#b8864f", highlight: "#f1d2a2" };
  const root = color.id === "black"
    ? { id: "root-black", shadow: "#050404", mid: "#151110", highlight: "#4a4340" }
    : { id: "root-dark", shadow: "#0c0604", mid: "#2e1c14", highlight: "#6e5040" };
  return { lift, root };
}

function smooth(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** A steady pseudo-random 0..1 per integer (same streaks every time). */
function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * How much to lighten (`light`) or darken (`dark`) a hair pixel for a finish.
 * `u` runs 0..1 across the hair, `v` 0..1 from its top to its ends.
 */
export function finishAmount(finish, u, v) {
  if (finish === "balayage") {
    const band = 0.8 + 0.2 * streak(u, 14);
    return { light: smooth(0.22, 0.9, v) * 0.85 * band, dark: 0 };
  }
  if (finish === "highlights") {
    return { light: streak(u, 38) * 0.62 * smooth(0.02, 0.12, v), dark: 0 };
  }
  if (finish === "rooted") {
    return { light: 0, dark: (1 - smooth(0.06, 0.3, v)) * 0.82 };
  }
  return { light: 0, dark: 0 };
}

/** Soft streak pattern: about a third of `bands` columns are lit, edges eased. */
function streak(u, bands) {
  const f = u * bands;
  const i = Math.floor(f);
  const t = f - i;
  const on = (j) => (hash01(j) > 0.64 ? 1 : 0);
  const a = on(i);
  const b = on(i + 1);
  return a + (b - a) * smooth(0.55, 1, t);
}

/** Bounding box (pixels) of where `inside(i)` holds, for a w-wide grid of n pixels. */
function boxOf(n, width, inside) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < n; i += 1) {
    if (!inside(i)) continue;
    const x = i % width;
    const y = (i / width) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/** Mix a finish into one pixel's color (in place). `step` is the LUT index * 3. */
function finishPixel(data, o, step, amount, luts) {
  const { light, dark } = amount;
  if (light <= 0 && dark <= 0) return;
  for (let c = 0; c < 3; c += 1) {
    let v = data[o + c];
    if (light > 0) v += (luts.lift[step + c] - v) * light;
    if (dark > 0) v += (luts.root[step + c] - v) * dark;
    data[o + c] = v;
  }
}

function finishLuts(color, finish) {
  if (!color || !finish || finish === "solid") return null;
  const { lift, root } = finishShades(color);
  return { lift: hairColorLut(lift), root: hairColorLut(root) };
}

/** Face shapes, in the order the model picker shows them. */
export const FACE_SHAPES = [
  { id: "oval", label: "Oval" },
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
  { id: "heart", label: "Heart" },
  { id: "long", label: "Long (Oblong)" },
  { id: "diamond", label: "Diamond" },
];

/**
 * Practice models: AI-made, fictional people (not real, not look-alikes), one
 * woman and one man per face shape. Same size and framing, hair out of the way.
 */
export const HAIR_MODELS = FACE_SHAPES.flatMap((shape) =>
  [["woman", "Woman"], ["man", "Man"]].map(([who, whoLabel]) => ({
    id: `${shape.id}-${who}`,
    shape: shape.id,
    shapeLabel: shape.label,
    who: whoLabel,
    label: `${shape.label} face · ${whoLabel}`,
    src: `assets/models/${shape.id}-${who}.webp`,
  })),
);

/**
 * Finished portraits: each practice model wearing each cut from their set, in a
 * neutral medium brown (recolored on the phone). Models with no portraits yet are
 * left out of the picker.
 */
const WOMEN_LOOKS = ["bob", "lob", "butterfly", "straight", "blowout", "waves", "silk", "curls", "braids", "ponytail", "bun", "pixie", "wolf", "afro", "locs", "shag"];
const MEN_LOOKS = ["crop", "buzz", "taper", "comma", "twoblock", "softwolf", "mullet", "flow", "fade", "waves360", "curlytop", "twists", "cornrows", "locs"];
export const HAIR_LOOKS = {
  "oval-woman": WOMEN_LOOKS,
  "round-woman": WOMEN_LOOKS,
  "square-woman": WOMEN_LOOKS,
  "heart-woman": WOMEN_LOOKS,
  "long-woman": WOMEN_LOOKS,
  "diamond-woman": WOMEN_LOOKS,
  "oval-man": MEN_LOOKS,
  "square-man": MEN_LOOKS,
  "round-man": MEN_LOOKS,
  "heart-man": MEN_LOOKS,
  "long-man": MEN_LOOKS,
  "diamond-man": MEN_LOOKS,
};

/** Practice models that have portraits, in picker order. */
export const LOOK_MODELS = HAIR_MODELS.filter((model) => HAIR_LOOKS[model.id]);

/** "women" or "men" for a model. */
export function modelAudience(model) {
  return model?.id?.endsWith("-man") ? "men" : "women";
}

/** The portrait of a model wearing a style, or null when there isn't one. */
export function hairLookSrc(modelId, styleId) {
  return HAIR_LOOKS[modelId]?.includes(styleId) ? `assets/looks/${modelId}/${styleId}.webp` : null;
}

export function hairModelById(id) {
  return HAIR_MODELS.find((model) => model.id === id) || null;
}

export function hairStyleById(id) {
  return HAIR_STYLES.find((style) => style.id === id) || HAIR_STYLES[0];
}

export function hairColorById(id) {
  return HAIR_COLORS.find((color) => color.id === id) || HAIR_COLORS[0];
}

/** x and y are the center of the face, as a fraction of the stage. */
export function defaultHairPlacement() {
  return {
    photoId: null,
    modelId: null,
    styleId: "bob",
    colorId: "black",
    x: 0.5,
    y: 0.45,
    scale: 1,
    rotation: 0,
    stretchX: 1,
    stretchY: 1,
    lift: 0,
    pushBack: false,
    crownTop: 0,
    contour: null,
    fitFor: "",
  };
}

/** Hairline slider range, in view units (positive moves the hair down). */
export const HAIR_LIFT_RANGE = 36;

export function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ];
}

/** 256-step lookup table (r, g, b per step) from shadow through mid to highlight. */
export function hairColorLut(color) {
  const stops = [color.shadow, color.mid, color.highlight].map(hexToRgb);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    const [from, to, u] = t < 0.5 ? [stops[0], stops[1], t / 0.5] : [stops[1], stops[2], (t - 0.5) / 0.5];
    for (let c = 0; c < 3; c += 1) lut[i * 3 + c] = Math.round(from[c] + (to[c] - from[c]) * u);
  }
  return lut;
}

/**
 * Recolor RGBA pixels in place. The source is gray, so its red channel is the
 * strand brightness; alpha is left alone.
 */
export function tintHairPixels(data, lut, { width = 0, finish = "solid", color = null } = {}) {
  const luts = width ? finishLuts(color, finish) : null;
  const n = data.length / 4;
  const box = luts ? boxOf(n, width, (i) => data[i * 4 + 3] > 40) : null;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const step = data[i] * 3;
    data[i] = lut[step];
    data[i + 1] = lut[step + 1];
    data[i + 2] = lut[step + 2];
    if (box) {
      const p = i / 4;
      finishPixel(data, i, step, finishAmount(finish, ((p % width) - box.x0) / box.w, (((p / width) | 0) - box.y0) / box.h), luts);
    }
  }
  return data;
}

/**
 * Where to draw the hair image on a stage. (cx, cy) is the face center and the
 * pivot for rotation; (left, top) is the image corner before rotation.
 */
export function hairFrame(stageW, stageH, placement = {}) {
  const scale = Number(placement.scale) || 1;
  const stretchX = Number(placement.stretchX) || 1;
  const stretchY = Number(placement.stretchY) || 1;
  const unit = (Math.min(stageW, stageH) * 0.86 * scale) / HAIR_BASE_UNITS;
  const w = HAIR_VIEW_W * unit * stretchX;
  const h = HAIR_VIEW_H * unit * stretchY;
  const anchorX = HAIR_FACE.cx / HAIR_VIEW_W;
  const anchorY = HAIR_FACE.cy / HAIR_VIEW_H;
  const rotation = Number(placement.rotation) || 0;
  const lift = Math.max(-HAIR_LIFT_RANGE, Math.min(HAIR_LIFT_RANGE, Number(placement.lift) || 0)) * unit * stretchY;
  const rad = (rotation * Math.PI) / 180;
  const cx = (Number(placement.x) || 0) * stageW - Math.sin(rad) * lift;
  const cy = (Number(placement.y) || 0) * stageH + Math.cos(rad) * lift;
  return {
    w,
    h,
    cx,
    cy,
    anchorX,
    anchorY,
    left: cx - anchorX * w,
    top: cy - anchorY * h,
    rotation,
  };
}

/** MediaPipe Face Mesh points used for fitting. */
export const FACE_POINTS = {
  brow: 9,
  noseBase: 2,
  chin: 152,
  left: 234,
  right: 454,
  eyeLeft: 33,
  eyeRight: 263,
  top: 10,
  nose: 1,
};

/** The Face Mesh outline (forehead, temples, cheeks, jaw), clockwise from the top. */
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

/** Pick the fitting points out of a full landmark list ({x, y} in 0..1 of the image). */
export function facePointsFromLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) return null;
  const ok = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
  const out = {};
  for (const [name, index] of Object.entries(FACE_POINTS)) {
    const point = landmarks[index];
    if (!ok(point)) return null;
    out[name] = { x: point.x, y: point.y };
  }
  const oval = FACE_OVAL.map((index) => landmarks[index]);
  if (oval.every(ok)) out.oval = oval.map((point) => ({ x: point.x, y: point.y }));
  return out;
}

/**
 * Head proportions, as a share of the brow-to-chin length (landmark 9 to 152),
 * measured on front-facing heads: the hairline sits about 0.38 above the brow and
 * the top of the skull about 0.58 above it.
 */
export const HEAD = { hairline: 0.38, skull: 0.62 };

/** Angles sampled around the face for the head outline (the warp follows it). */
export const CONTOUR_STEPS = 48;

/** How much wider the head reads on the far side of a fully turned face. */
export const YAW_SPREAD = 0.9;

/** Least the hair above the head may be thinned to (1 = untouched). */
export const MIN_CROWN = 0.45;

/**
 * Turn face points (0..1 of the image) into a placement for one style.
 * Size comes from the head (hairline to chin), not the cheeks, so short cuts are
 * no wider than the head. `contour` is the head outline in the style's view units
 * (radius per angle around the face center); the hair is warped so its inner edge
 * hugs that outline and its volume follows the skull. `crown` thins the hair above
 * the head so it rises a natural amount over the real skull, as a dome. Returns
 * null when the face looks unusable.
 */
export function fitHairToFace(points, { imageW, imageH, stageW, stageH }, styleEntry) {
  if (!points || !imageW || !imageH || !stageW || !stageH) return null;
  const fitted = containRect(stageW, stageH, imageW, imageH);
  const at = (p) => ({ x: fitted.x + p.x * fitted.w, y: fitted.y + p.y * fitted.h });
  const eyeL = at(points.eyeLeft);
  const eyeR = at(points.eyeRight);
  const theta = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
  const along = { x: Math.cos(theta), y: Math.sin(theta) };
  const down = { x: -Math.sin(theta), y: Math.cos(theta) };
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const brow = at(points.brow);
  const chin = at(points.chin);
  const browChin = dot(sub(chin, brow), down);
  const faceWidth = Math.abs(dot(sub(at(points.right), at(points.left)), along));
  if (!(browChin > 4) || !(faceWidth > 4)) return null;
  const face = { ...OPENING, ...(styleEntry?.face || {}) };
  const base = (Math.min(stageW, stageH) * 0.86) / HAIR_BASE_UNITS;
  // Size: the style's opening spans hairline to chin.
  const used = (browChin * (1 + HEAD.hairline)) / (face.chin - face.top);
  const scale = Math.max(0.3, Math.min(3, used / base));
  const unit = scale * base;
  const hairlineAbove = browChin * HEAD.hairline;
  const mid = (dot(brow, down) - hairlineAbove + dot(chin, down)) / 2;
  const openMid = (face.top + face.chin) / 2;
  const centerDown = mid + (HAIR_FACE.cy - openMid) * unit;
  // Across: the middle of the face outline (the brow drifts off-center when the head turns).
  const ovalStage = points.oval?.length >= 12 ? points.oval.map(at) : null;
  const spans = ovalStage ? ovalStage.map((p) => dot(p, along)) : null;
  const centerAlong = spans ? (Math.min(...spans) + Math.max(...spans)) / 2 : dot(brow, along);
  const center = {
    x: along.x * centerAlong + down.x * centerDown,
    y: along.y * centerAlong + down.y * centerDown,
  };
  // Stage px -> the style's view units (upright, face center at HAIR_FACE).
  const toView = (p) => {
    const d = sub(p, center);
    return { x: HAIR_FACE.cx + dot(d, along) / unit, y: HAIR_FACE.cy + dot(d, down) / unit };
  };
  const browView = toView(brow);
  const outline = ovalStage
    ? ovalStage.map(toView)
    : defaultOutline(face, faceWidth / (2 * unit));
  // Yaw: where the nose tip sits between the cheeks (-1 turned to its left on screen, +1 right).
  const yaw = points.nose
    ? Math.max(-1, Math.min(1, ((dot(sub(at(points.nose), at(points.left)), along) / faceWidth) - 0.5) * 2))
    : 0;
  const contour = headContour(outline, browView.y, face.top, yaw);
  const faceContour = Math.abs(yaw) >= 0.05 ? headContour(outline, browView.y, face.top, 0) : null;
  // Crown: the hair may rise a little above the skull (skull + the style's allowance).
  const wantAbove = (browChin * (HEAD.skull - HEAD.hairline + face.allow)) / unit;
  const crownTop = HAIR_FACE.cy - face.top + wantAbove;
  return {
    x: center.x / stageW,
    y: center.y / stageH,
    scale,
    rotation: (theta * 180) / Math.PI,
    stretchX: 1,
    stretchY: 1,
    crownTop: Math.round(crownTop * 2) / 2,
    yaw: Math.round(yaw * 100) / 100,
    contour,
    faceContour,
  };
}

/** An oval outline (view units) used when the full mesh isn't available. */
function defaultOutline(face, halfW) {
  const out = [];
  for (let i = 0; i < 36; i += 1) {
    const a = (i / 36) * Math.PI * 2;
    const ry = Math.sin(a) < 0 ? HAIR_FACE.cy - face.top : face.chin - HAIR_FACE.cy;
    out.push({ x: HAIR_FACE.cx + Math.cos(a) * halfW, y: HAIR_FACE.cy + Math.sin(a) * ry });
  }
  return out;
}

/**
 * Radius of the head outline at CONTOUR_STEPS angles around HAIR_FACE (angle 0
 * points right, angles grow clockwise on screen, so 3/4 turn is straight up). The
 * mesh stops below the hairline, so the part above the brow is raised to reach it.
 */
export function headContour(outline, browY, hairlineY, yaw = 0) {
  const top = Math.min(...outline.map((p) => p.y));
  const lift = top < browY - 1 && hairlineY < top ? (browY - hairlineY) / (browY - top) : 1;
  const pts = outline.map((p) => (p.y < browY ? { x: p.x, y: browY - (browY - p.y) * lift } : p));
  const radii = [];
  for (let i = 0; i < CONTOUR_STEPS; i += 1) {
    const a = (i / CONTOUR_STEPS) * Math.PI * 2;
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    let best = 0;
    for (let j = 0; j < pts.length; j += 1) {
      const p = pts[j];
      const q = pts[(j + 1) % pts.length];
      const r = rayHit(dir, { x: p.x - HAIR_FACE.cx, y: p.y - HAIR_FACE.cy }, { x: q.x - HAIR_FACE.cx, y: q.y - HAIR_FACE.cy });
      if (r > best) best = r;
    }
    let r = best || HAIR_FACE.rx;
    // Turned heads: the back of the skull shows past the face on the far side.
    const far = yaw * dir.x < 0 ? Math.abs(yaw) * Math.abs(dir.x) ** 0.6 : 0;
    const high = dir.y <= 0 ? 1 : Math.max(0, 1 - dir.y / 0.6);
    r *= 1 + YAW_SPREAD * far * high;
    // ...and a turned face's near side is the cheek edge, so nothing is added there.
    radii.push(Math.round(r * 2) / 2);
  }
  return radii;
}

function rayHit(dir, p, q) {
  const ex = q.x - p.x;
  const ey = q.y - p.y;
  const den = dir.x * ey - dir.y * ex;
  if (Math.abs(den) < 1e-9) return 0;
  const t = (p.x * ey - p.y * ex) / den;
  const u = (p.x * dir.y - p.y * dir.x) / den;
  return t > 0 && u >= -1e-6 && u <= 1 + 1e-6 ? t : 0;
}

/** Radius of a style's own face opening at angle `a` (view units). */
export function openingRadius(face, a) {
  const rx = face.halfW;
  const ry = Math.sin(a) < 0 ? HAIR_FACE.cy - face.top : face.chin - HAIR_FACE.cy;
  const c = Math.cos(a) / rx;
  const s = Math.sin(a) / ry;
  return 1 / Math.sqrt(c * c + s * s);
}

/** Contour radius at any angle, read off the sampled ring. */
export function contourRadius(contour, a) {
  const n = contour.length;
  const f = ((((a / (Math.PI * 2)) * n) % n) + n) % n;
  const i = Math.floor(f);
  const t = f - i;
  return contour[i] * (1 - t) + contour[(i + 1) % n] * t;
}

/**
 * Outer edge of a hair image, per angle (view units from HAIR_FACE): march out
 * from the face opening until the hair runs out. `alpha(x, y)` reads opacity
 * (0..255) at a view-unit point.
 */
export function outerProfile(alpha, face, steps = CONTOUR_STEPS) {
  const out = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const r0 = openingRadius(face, a);
    let last = r0;
    let gap = 0;
    for (let r = r0; r < 700; r += 1) {
      const x = HAIR_FACE.cx + dx * r;
      const y = HAIR_FACE.cy + dy * r;
      if (x < 0 || y < 0 || x >= HAIR_VIEW_W || y >= HAIR_VIEW_H) break;
      if (alpha(x, y) > 40) {
        last = r;
        gap = 0;
      } else if ((gap += 1) > 10) break;
    }
    out.push(last);
  }
  return out;
}

/**
 * Per-angle thinning (1 = untouched) so the hair above the head ends on a smooth
 * dome: an ellipse that meets the hair's own width at ear level and tops out at
 * `crownTop` (view units above HAIR_FACE), never below the head plus a margin.
 * Only thins, never adds; fades to none at ear level; smoothed so it can't kink.
 */
export function domeThinning(face, contour, outer, crownTop) {
  const n = contour.length;
  if (!(crownTop > 0) || outer.length !== n) return new Array(n).fill(1);
  const outAt = (i) => contour[i] + Math.max(0, outer[i] - openingRadius(face, (i / n) * Math.PI * 2));
  const rxRight = outAt(0);
  const rxLeft = outAt(n / 2);
  const ry = Math.max(crownTop, contour[(n * 3) / 4] + 6);
  const raw = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const up = Math.max(0, -Math.sin(a));
    const have = outer[i] - openingRadius(face, a);
    if (up <= 0 || have <= 1) {
      raw.push(1);
      continue;
    }
    const c = Math.cos(a) / (Math.cos(a) >= 0 ? rxRight : rxLeft);
    const s = Math.sin(a) / ry;
    const dome = 1 / Math.sqrt(c * c + s * s);
    const want = Math.max(4, dome - contour[i]);
    const fit = Math.max(MIN_CROWN, Math.min(1, want / have));
    raw.push(1 - up ** 0.7 * (1 - fit));
  }
  return raw.map((_, i) => {
    let sum = 0;
    for (let d = -2; d <= 2; d += 1) sum += raw[(i + d + n) % n];
    return Math.round((sum / 5) * 100) / 100;
  });
}

/**
 * Where an output point (view units) reads from in the style image. Inside the
 * head the opening is scaled onto the outline; outside, the hair keeps its
 * thickness but starts at the outline, and above the head it is thinned by
 * `crown` (fading to none at ear level) so the top stays a rounded dome.
 */
/** Hair (view units) stretched over skull that shows past a turned face. */
export const GAP_BAND = 14;

export function warpSource(x, y, face, contour, thin = 1, faceContour = null) {
  const dx = x - HAIR_FACE.cx;
  const dy = y - HAIR_FACE.cy;
  const r = Math.hypot(dx, dy);
  if (r < 1e-6) return { x, y };
  const a = Math.atan2(dy, dx);
  const rHead = contourRadius(contour, a);
  const rOpen = openingRadius(face, a);
  const c = Array.isArray(thin) || ArrayBuffer.isView(thin) ? contourRadius(thin, a) : 1 - (1 - thin) * Math.max(0, -dy / r) ** 2;
  const rFace = faceContour ? Math.min(rHead, contourRadius(faceContour, a)) : rHead;
  let rs;
  if (r <= rFace) rs = (r * rOpen) / rFace;
  else if (r <= rHead) rs = rOpen + ((r - rFace) / (rHead - rFace)) * GAP_BAND; // cover the skull past the face
  else rs = rOpen + (rHead > rFace ? GAP_BAND : 0) + (r - rHead) / c;
  return { x: HAIR_FACE.cx + (dx / r) * rs, y: HAIR_FACE.cy + (dy / r) * rs };
}

export function containRect(boxW, boxH, imageW, imageH) {
  const imageScale = Math.min(boxW / imageW, boxH / imageH);
  const w = imageW * imageScale;
  const h = imageH * imageScale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

const imageCache = new Map();
const tintCache = new Map();

export function loadHairImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageCache.delete(src);
      reject(new Error("Could not load that hairstyle."));
    };
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

/**
 * Clear a soft oval over the forehead so the hairline sits further back. For
 * fringe styles this lifts the bangs off the face. Works in image pixels.
 */
export function pushBackOval(width, height, styleEntry) {
  const face = { ...OPENING, ...(styleEntry?.face || {}) };
  const k = width / HAIR_VIEW_W;
  const rx = HAIR_FACE.rx * 1.02 * k;
  const top = (face.top - 12) * k;
  const cy = HAIR_FACE.cy * k;
  return { cx: HAIR_FACE.cx * k, cy, rx, ry: cy - top, feather: 16 * k, height };
}

/**
 * Bend the hair so its inner edge follows a head outline (see warpSource).
 * Works on whole pixels with bilinear sampling. Browser only.
 */
function warpToHead(source, styleEntry, contour, crownTop, faceContour) {
  const face = { ...OPENING, ...(styleEntry?.face || {}) };
  const w = source.width;
  const h = source.height;
  const k = w / HAIR_VIEW_W;
  const src = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const outer = outerProfile((x, y) => src[(Math.floor(y * k) * w + Math.floor(x * k)) * 4 + 3], face, contour.length);
  const crown = domeThinning(face, contour, outer, crownTop);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  const image = ctx.createImageData(w, h);
  const dst = image.data;
  for (let py = 0; py < h; py += 1) {
    for (let px = 0; px < w; px += 1) {
      const s = warpSource((px + 0.5) / k, (py + 0.5) / k, face, contour, crown, faceContour);
      const sx = s.x * k - 0.5;
      const sy = s.y * k - 0.5;
      if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) continue;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * w + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + w * 4;
      const i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const a = src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11;
      if (a < 0.5) continue;
      const o = (py * w + px) * 4;
      for (let c = 0; c < 3; c += 1) {
        // Premultiplied blend so transparent edges don't darken.
        dst[o + c] = (src[i00 + c] * src[i00 + 3] * w00 + src[i10 + c] * src[i10 + 3] * w10
          + src[i01 + c] * src[i01 + 3] * w01 + src[i11 + c] * src[i11 + 3] * w11) / a;
      }
      dst[o + 3] = a;
    }
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

/**
 * A canvas with the style painted in the color, bent to the head when a contour
 * is given. Cached per style, color, push-back, and head shape. Browser only.
 */
export async function tintedHairCanvas(styleEntry, color, { pushBack = false, contour = null, faceContour = null, crownTop = 0, finish = "solid" } = {}) {
  const ring = Array.isArray(contour) && contour.length === CONTOUR_STEPS ? contour : null;
  const faceRing = ring && Array.isArray(faceContour) && faceContour.length === CONTOUR_STEPS ? faceContour : null;
  const thin = ring ? Number(crownTop) || 0 : 0;
  const key = `${styleEntry.src}|${color.id}|${finish}|${pushBack ? 1 : 0}|${ring ? ring.join(",") : "-"}|${faceRing ? faceRing.join(",") : "-"}|${thin}`;
  if (tintCache.has(key)) return tintCache.get(key);
  const image = await loadHairImage(styleEntry.src);
  let canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  let ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  tintHairPixels(pixels.data, hairColorLut(color), { width: canvas.width, finish, color });
  ctx.putImageData(pixels, 0, 0);
  if (pushBack) {
    const oval = pushBackOval(canvas.width, canvas.height, styleEntry);
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, oval.cy);
    ctx.clip();
    ctx.translate(oval.cx, oval.cy);
    ctx.scale(1, oval.ry / oval.rx);
    const inner = Math.max(1, oval.rx - oval.feather);
    const gradient = ctx.createRadialGradient(0, 0, inner, 0, 0, oval.rx + oval.feather * 0.4);
    gradient.addColorStop(0, "rgba(0,0,0,1)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, oval.rx + oval.feather, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (ring) canvas = warpToHead(canvas, styleEntry, ring, thin, faceRing);
  canvas.className = "hair-art";
  if (tintCache.size > 24) tintCache.delete(tintCache.keys().next().value);
  tintCache.set(key, canvas);
  return canvas;
}

/** Flatten the photo and the hair into one JPEG. Browser only. */
export async function flattenHairCanvas({
  photoImage,
  photoWidth,
  photoHeight,
  hairCanvas,
  placement,
  stageWidth,
  stageHeight,
  pixelRatio = 2,
}) {
  if (typeof document === "undefined") throw new Error("Hair can only be saved in the browser.");
  const width = Math.max(1, Math.round(stageWidth));
  const height = Math.max(1, Math.round(stageHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * pixelRatio));
  canvas.height = Math.max(1, Math.round(height * pixelRatio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#f4e7dc";
  ctx.fillRect(0, 0, width, height);
  const fitted = containRect(width, height, photoWidth, photoHeight);
  ctx.drawImage(photoImage, fitted.x, fitted.y, fitted.w, fitted.h);
  const frame = hairFrame(width, height, placement);
  ctx.save();
  ctx.translate(frame.cx, frame.cy);
  ctx.rotate((frame.rotation * Math.PI) / 180);
  ctx.drawImage(hairCanvas, -frame.anchorX * frame.w, -frame.anchorY * frame.h, frame.w, frame.h);
  ctx.restore();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Could not save that hair.");
  return blob;
}

/**
 * Recolor the hair in a portrait, in place. `mask` is the hair confidence (0..1)
 * per pixel. Brightness inside the hair is stretched over the color's gradient
 * map, so strands keep their light and shade in any of the colors, and the mask
 * blends the edges.
 */
export function recolorHairPixels(data, mask, lut, { width = 0, finish = "solid", color = null } = {}) {
  const n = Math.min(mask.length, data.length / 4);
  const luts = width ? finishLuts(color, finish) : null;
  const box = luts ? boxOf(n, width, (i) => mask[i] >= 0.5) : null;
  const hist = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    if (mask[i] < 0.5) continue;
    const o = i * 4;
    hist[Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2])] += 1;
    count += 1;
  }
  if (!count) return data;
  const pick = (share) => {
    let seen = 0;
    for (let v = 0; v < 256; v += 1) {
      seen += hist[v];
      if (seen >= share * count) return v;
    }
    return 255;
  };
  const lo = pick(0.03);
  const hi = Math.max(lo + 8, pick(0.97));
  for (let i = 0; i < n; i += 1) {
    const m = mask[i];
    if (m <= 0.02) continue;
    const a = m >= 0.98 ? 1 : m * m * (3 - 2 * m);
    const o = i * 4;
    const y = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    const step = Math.max(0, Math.min(255, Math.round(((y - lo) / (hi - lo)) * 255))) * 3;
    data[o] += (lut[step] - data[o]) * a;
    data[o + 1] += (lut[step + 1] - data[o + 1]) * a;
    data[o + 2] += (lut[step + 2] - data[o + 2]) * a;
    if (box) {
      const f = finishAmount(finish, ((i % width) - box.x0) / box.w, (((i / width) | 0) - box.y0) / box.h);
      finishPixel(data, o, step, { light: f.light * a, dark: f.dark * a }, luts);
    }
  }
  return data;
}
