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

/** Shared face opening, in view units: hairline, chin, and half the cheek width. */
const OPENING = { top: 154, chin: 346, halfW: 78 };

export const HAIR_GROUPS = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
  { id: "textured", label: "Textured" },
];

function style(id, label, file, group, extra = {}) {
  const { face, ...rest } = extra;
  return { id, label, src: `assets/hair/${file}.webp`, group, bangs: false, ...rest, face: { ...OPENING, ...(face || {}) } };
}

/**
 * `face` says where the face opening sits in each image (view units): `top` is the
 * hairline, `chin` the chin, `halfW` half the cheek width. Auto-fit maps these to
 * the detected face. `bangs` styles have a fringe that covers the upper forehead.
 */
export const HAIR_STYLES = [
  style("pixie", "Textured Pixie", "pixie", "short", { bangs: true }),
  style("taper", "Classic Taper", "taper", "short", { face: { top: 138 } }),
  style("crop", "Textured Crop / Buzz Cut", "crop", "short", { bangs: true, face: { top: 140, halfW: 84 } }),
  style("fade", "High-Top Fade", "high-top-fade", "short", { face: { top: 138 } }),
  style("bob", "Chin-Length Blunt Bob", "bob", "medium"),
  style("lob", "Collarbone Lob", "lob", "medium"),
  style("shag", "Curtain Bangs Shag", "shag", "medium", { bangs: true }),
  style("wolf", "Wolf Cut", "wolf", "medium", { bangs: true }),
  style("straight", "Long Sleek Layers", "long-layers", "long"),
  style("waves", "Beach Waves", "beach-waves", "long"),
  style("silk", "Silk Press", "silk-press", "long"),
  style("bun", "Sleek High Bun", "high-bun", "long"),
  style("curls", "Defined Curls", "curls", "textured"),
  style("afro", "Natural Afro", "afro", "textured"),
  style("braids", "Knotless Box Braids", "braids", "textured"),
  style("locs", "Starter Locs / Shoulder Locs", "locs", "textured"),
];

/**
 * `hex` is the swatch. `shadow`, `mid`, and `highlight` are the gradient map:
 * dark strands take `shadow`, average strands `mid`, shine takes `highlight`.
 */
export const HAIR_COLORS = [
  { id: "black", label: "Black", hex: "#1a1412", shadow: "#0a0808", mid: "#262120", highlight: "#6b625d" },
  { id: "dark-brown", label: "Dark Brown", hex: "#3a2418", shadow: "#140b07", mid: "#4a2f20", highlight: "#a07a60" },
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
  return HAIR_STYLES.find((style) => style.id === id) || HAIR_STYLES[1];
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
 * Turn face points (0..1 of the image) into a placement for one style. The
 * hairline is estimated with facial thirds: it sits one "nose-to-chin" length
 * above the brow. Returns null when the face looks unusable.
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
  const lowerThird = dot(sub(chin, at(points.noseBase)), down);
  const faceWidth = Math.abs(dot(sub(at(points.right), at(points.left)), along));
  if (!(lowerThird > 2) || !(faceWidth > 4)) return null;
  const hairline = { x: brow.x - down.x * lowerThird, y: brow.y - down.y * lowerThird };
  const faceLength = dot(sub(chin, hairline), down);
  if (!(faceLength > 4)) return null;
  const face = styleEntry?.face || OPENING;
  const sy = faceLength / (face.chin - face.top);
  const sx = (faceWidth * FIT_WIDTH) / (2 * face.halfW);
  const base = (Math.min(stageW, stageH) * 0.86) / HAIR_BASE_UNITS;
  const scale = Math.max(0.45, Math.min(2.4, sy / base));
  const used = scale * base;
  const stretchX = Math.max(0.5, Math.min(1.5, sx / used));
  const toCenter = (HAIR_FACE.cy - face.top) * used;
  const center = { x: hairline.x + down.x * toCenter, y: hairline.y + down.y * toCenter };
  return {
    x: center.x / stageW,
    y: center.y / stageH,
    scale,
    rotation: (theta * 180) / Math.PI,
    stretchX,
    stretchY: 1,
  };
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
  const face = styleEntry?.face || OPENING;
  const k = width / HAIR_VIEW_W;
  const rx = HAIR_FACE.rx * 1.02 * k;
  const top = (face.top - 12) * k;
  const cy = HAIR_FACE.cy * k;
  return { cx: HAIR_FACE.cx * k, cy, rx, ry: cy - top, feather: 16 * k, height };
}

/** A canvas with the style painted in the color. Cached per style, color, and push-back. Browser only. */
export async function tintedHairCanvas(styleEntry, color, { pushBack = false } = {}) {
  const key = `${styleEntry.src}|${color.id}|${pushBack ? 1 : 0}`;
  if (tintCache.has(key)) return tintCache.get(key);
  const image = await loadHairImage(styleEntry.src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  tintHairPixels(pixels.data, hairColorLut(color));
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
