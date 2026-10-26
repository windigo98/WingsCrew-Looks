/**
 * On-device hair overlays. Each style is one photo-real cutout (transparent WebP,
 * stored in neutral gray). Color is painted on at runtime with a gradient map, so
 * the strand highlights and shadows from the photo stay. No network calls.
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
  style("butterfly", "Butterfly Cut", "butterfly", "long", { bangs: true, for: ["women"], face: { crown: 13, allow: 0.1, dome: 0.75 } }),
  style("straight", "Long Layers", "long-layers", "long", { for: ["women"], face: { crown: 90, allow: 0.04 } }),
  style("blowout", "Bouncy Blowout", "blowout", "long", { for: ["women"], face: { crown: 9, allow: 0.14, dome: 0.7 } }),
  style("waves", "Beach Waves", "beach-waves", "long", { for: ["women"], face: { crown: 76, allow: 0.07 } }),
  style("silk", "Silk Press", "silk-press", "long", { for: ["women"], face: { crown: 76, allow: 0.03 } }),
  style("curls", "Defined Curls", "curls", "textured", { for: ["women"], face: { crown: 62, allow: 0.14 } }),
  style("braids", "Knotless Braids", "braids", "textured", { for: ["women"], face: { crown: 61, allow: 0.05 } }),
  style("ponytail", "Sleek High Ponytail", "ponytail", "up", { for: ["women"], face: { crown: 52, allow: 0.14 } }),
  style("bun", "High Bun / Chignon", "high-bun", "up", { for: ["women"], face: { crown: 33, allow: 0.3 } }),
  style("pixie", "Textured Pixie", "pixie", "short", { bangs: true, for: ["women"], face: { crown: 45, allow: 0.1 } }),
  style("wolf", "Wolf Cut", "wolf", "medium", { bangs: true, for: ["women"], face: { crown: 13, allow: 0.12, dome: 0.7 } }),
  style("afro", "Natural Afro", "afro", "textured", { for: ["women"], face: { crown: 4, allow: 0.36 } }),
  style("locs", "Shoulder Locs", "locs", "textured", { for: ["women", "men"], face: { crown: 90, allow: 0.06 } }),
  style("shag", "Wispy Bangs Shag", "shag", "medium", { bangs: true, for: ["women"], face: { crown: 14, allow: 0.1, dome: 0.75 } }),
  style("crop", "Low Taper + Textured Crop", "crop", "short", { bangs: true, for: ["men"], face: { top: 140, halfW: 84, crown: 81, allow: 0.07 } }),
  style("buzz", "Buzz Cut", "buzz", "short", { for: ["men"], face: { crown: 69, allow: 0.04, dome: 0.75 } }),
  style("taper", "Classic Side Part", "taper", "short", { for: ["men"], face: { top: 138, crown: 77, allow: 0.08 } }),
  style("comma", "Comma Hair", "comma", "medium", { bangs: true, for: ["men"], face: { crown: 75, allow: 0.06, dome: 0.45 } }),
  style("twoblock", "Two-Block", "twoblock", "medium", { bangs: true, for: ["men"], face: { crown: 78, allow: 0.06, dome: 0.5 } }),
  style("softwolf", "Soft Wolf Cut", "softwolf", "medium", { bangs: true, for: ["men"], face: { crown: 70, allow: 0.08 } }),
  style("mullet", "Modern Mullet", "mullet", "medium", { bangs: true, for: ["men"], face: { crown: 77, allow: 0.06, dome: 0.5 } }),
  style("flow", "Flow (Swept Back)", "flow", "medium", { for: ["men"], face: { crown: 75, allow: 0.06, dome: 0.45 } }),
  style("fade", "High-Top Fade", "high-top-fade", "short", { for: ["men"], face: { top: 138, crown: 46, allow: 0.32 } }),
  style("waves360", "360 Waves", "waves360", "short", { for: ["men"], face: { crown: 59, allow: 0.04, dome: 0.75 } }),
  style("curlytop", "Curly Top + Taper", "curlytop", "textured", { bangs: true, for: ["men"], face: { crown: 65, allow: 0.12, dome: 0.5 } }),
  style("twists", "Two-Strand Twists", "twists", "textured", { bangs: true, for: ["men"], face: { crown: 75, allow: 0.1, dome: 0.5 } }),
  style("cornrows", "Stitch Braids", "cornrows", "textured", { for: ["men"], face: { crown: 52, allow: 0.05, dome: 0.7 } }),
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
  { id: "black", label: "Black", hex: "#1a1412", shadow: "#0a0808", mid: "#262120", highlight: "#6b625d" },
  { id: "dark-brown", label: "Espresso", hex: "#2e1b13", shadow: "#0e0705", mid: "#3b2318", highlight: "#8c6450" },
  { id: "light-brown", label: "Light Brown", hex: "#8a5a32", shadow: "#28160b", mid: "#87593a", highlight: "#d9b48c" },
  { id: "blonde", label: "Blonde", hex: "#e2c07a", shadow: "#5b4020", mid: "#c7a46b", highlight: "#fbeccb" },
  { id: "auburn", label: "Auburn", hex: "#8f2d1f", shadow: "#240b06", mid: "#7f2c18", highlight: "#cf7650" },
  { id: "pink", label: "Pink", hex: "#e56aa6", shadow: "#3d1024", mid: "#c95b8c", highlight: "#fbc3da" },
];

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
    topScale: 1,
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
export function tintHairPixels(data, lut) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const step = data[i] * 3;
    data[i] = lut[step];
    data[i + 1] = lut[step + 1];
    data[i + 2] = lut[step + 2];
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
};

/** Pick the fitting points out of a full landmark list ({x, y} in 0..1 of the image). */
export function facePointsFromLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 468) return null;
  const out = {};
  for (const [name, index] of Object.entries(FACE_POINTS)) {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    out[name] = { x: point.x, y: point.y };
  }
  return out;
}

/** How wide the cheek opening is compared with the 234–454 landmark span. */
const FIT_WIDTH = 0.94;

/**
 * Head proportions, as a share of the brow-to-chin length (landmark 9 to 152),
 * measured on front-facing heads: the hairline sits about 0.38 above the brow and
 * the top of the skull about 0.58 above it.
 */
export const HEAD = { hairline: 0.38, skull: 0.58 };

/** Height may differ from width by this much (keeps the style's own shape). */
export const FIT_ASPECT = 0.08;

/** Least the hair above the hairline is squeezed down to (1 = untouched). */
export const MIN_TOP_SCALE = 0.3;

/** How much a fully squeezed dome narrows at its top, so it stays round. */
const DOME_TAPER = 0.35;

/**
 * Turn face points (0..1 of the image) into a placement for one style. Width
 * comes from the cheeks; height follows within ±8%; the hair above the hairline
 * is squeezed (`topScale`) so the crown sits just above the real top of the
 * skull instead of high above it. Returns null when the face looks unusable.
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
  // Width: the opening spans the cheeks.
  const sx = (faceWidth * FIT_WIDTH) / (2 * face.halfW);
  // Height: hairline to chin, kept within ±8% of the width scale.
  const wantY = (browChin * (1 + HEAD.hairline)) / (face.chin - face.top);
  const sy = Math.max(sx * (1 - FIT_ASPECT), Math.min(sx * (1 + FIT_ASPECT), wantY));
  const scale = Math.max(0.3, Math.min(3, sx / base));
  const used = scale * base;
  const stretchY = Math.max(0.5, Math.min(1.5, sy / used));
  const syUsed = used * stretchY;
  // Center the opening between the hairline and the chin.
  const hairlineAbove = browChin * HEAD.hairline;
  const mid = (dot(brow, down) - hairlineAbove + dot(chin, down)) / 2;
  const openMid = (face.top + face.chin) / 2;
  const centerDown = mid + (HAIR_FACE.cy - openMid) * syUsed;
  const centerAlong = dot(brow, along);
  const center = {
    x: along.x * centerAlong + down.x * centerDown,
    y: along.y * centerAlong + down.y * centerDown,
  };
  // Crown: squeeze the hair above the opening so it tops out just over the skull.
  const holeTopDown = centerDown + (face.top - HAIR_FACE.cy) * syUsed;
  const crownDown = dot(brow, down) - browChin * (HEAD.skull + face.allow);
  const wantAbove = (holeTopDown - crownDown) / syUsed; // view units from opening top to crown
  const topScale = squeezeFor(face.top - face.crown, wantAbove);
  return {
    x: center.x / stageW,
    y: center.y / stageH,
    scale,
    rotation: (theta * 180) / Math.PI,
    stretchX: 1,
    stretchY,
    topScale: Math.round(topScale * 50) / 50,
  };
}

/** Band (view units) over which the squeeze eases in above the opening. */
export const SQUEEZE_BAND = 28;

/** The squeeze that brings a crown `have` units above the opening down to `want`. */
export function squeezeFor(have, want) {
  if (!(have > 1) || !(want < have)) return 1;
  const band = Math.min(SQUEEZE_BAND, have);
  const c = (want - band / 2) / (band / 2 + (have - band));
  return Math.round(Math.max(MIN_TOP_SCALE, Math.min(1, c)) * 50) / 50;
}

/**
 * Where a source row (image px, 0 at the top) lands after the top squeeze. Rows
 * below the opening's top stay put; above it they are packed down by `topScale`,
 * easing in over a soft band so strands don't kink.
 */
export function squeezeRow(y, topY, band, topScale) {
  const c = Math.max(MIN_TOP_SCALE, Math.min(1, topScale));
  if (c >= 1 || y >= topY) return y;
  const start = topY - band;
  if (y >= start) {
    const t = y - start;
    return topY - ((topY - y) * c + ((1 - c) * (band * band - t * t)) / (2 * band));
  }
  return topY - (band * (1 + c)) / 2 - (start - y) * c;
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

/** Pack the hair above the opening down (see squeezeRow). Browser only. */
function squeezeTop(source, styleEntry, topScale) {
  const k = source.width / HAIR_VIEW_W;
  const face = { ...OPENING, ...(styleEntry?.face || {}) };
  const topY = face.top * k;
  const band = Math.min(SQUEEZE_BAND, face.top - face.crown) * k;
  const crownY = face.crown * k;
  const cx = HAIR_FACE.cx * k;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  const rows = Math.ceil(topY);
  ctx.drawImage(source, 0, rows, source.width, source.height - rows, 0, rows, source.width, source.height - rows);
  const step = 2;
  for (let y = 0; y < rows; y += step) {
    const y1 = Math.min(rows, y + step);
    const d0 = squeezeRow(y, topY, band, topScale);
    const d1 = squeezeRow(y1, topY, band, topScale);
    // Round the dome: rows high above the opening pull in a little toward the middle.
    const rise = Math.max(0, Math.min(1, (topY - y) / Math.max(1, topY - crownY)));
    const narrow = 1 - (face.dome ?? DOME_TAPER) * (1 - topScale) * rise ** 1.6;
    const w = source.width * narrow;
    ctx.drawImage(source, 0, y, source.width, y1 - y, cx - cx * narrow, d0, w, Math.max(0.5, d1 - d0 + 0.35));
  }
  return out;
}

/** A canvas with the style painted in the color. Cached per style, color, push-back, and squeeze. Browser only. */
export async function tintedHairCanvas(styleEntry, color, { pushBack = false, topScale = 1 } = {}) {
  const squeeze = Math.max(MIN_TOP_SCALE, Math.min(1, Math.round((Number(topScale) || 1) * 50) / 50));
  const key = `${styleEntry.src}|${color.id}|${pushBack ? 1 : 0}|${squeeze}`;
  if (tintCache.has(key)) return tintCache.get(key);
  const image = await loadHairImage(styleEntry.src);
  let canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  let ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  tintHairPixels(pixels.data, hairColorLut(color));
  ctx.putImageData(pixels, 0, 0);
  if (squeeze < 1) {
    canvas = squeezeTop(canvas, styleEntry, squeeze);
    ctx = canvas.getContext("2d");
  }
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
