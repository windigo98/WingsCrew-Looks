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

export const HAIR_STYLES = [
  { id: "pixie", label: "Textured Pixie", src: "assets/hair/pixie.webp" },
  { id: "bob", label: "Chin-Length Blunt Bob", src: "assets/hair/bob.webp" },
  { id: "straight", label: "Long Sleek Layers", src: "assets/hair/long-layers.webp" },
  { id: "waves", label: "Beach Waves", src: "assets/hair/beach-waves.webp" },
  { id: "curls", label: "Defined Curls", src: "assets/hair/curls.webp" },
  { id: "braids", label: "Knotless Box Braids", src: "assets/hair/braids.webp" },
  { id: "fade", label: "High-Top Fade", src: "assets/hair/high-top-fade.webp" },
  { id: "bun", label: "Sleek High Bun", src: "assets/hair/high-bun.webp" },
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
    styleId: "bob",
    colorId: "black",
    x: 0.5,
    y: 0.45,
    scale: 1,
    rotation: 0,
    stretchX: 1,
    stretchY: 1,
  };
}

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
  const cx = (Number(placement.x) || 0) * stageW;
  const cy = (Number(placement.y) || 0) * stageH;
  return {
    w,
    h,
    cx,
    cy,
    anchorX,
    anchorY,
    left: cx - anchorX * w,
    top: cy - anchorY * h,
    rotation: Number(placement.rotation) || 0,
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

/** A canvas with the style painted in the color. Cached per style and color. Browser only. */
export async function tintedHairCanvas(style, color) {
  const key = `${style.src}|${color.id}`;
  if (tintCache.has(key)) return tintCache.get(key);
  const image = await loadHairImage(style.src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  tintHairPixels(pixels.data, hairColorLut(color));
  ctx.putImageData(pixels, 0, 0);
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
