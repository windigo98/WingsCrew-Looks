/** On-device hair overlays. One SVG per style; color comes from CSS variables. */

export const HAIR_VIEW_W = 400;
export const HAIR_VIEW_H = 560;

export const HAIR_STYLES = [
  { id: "pixie", label: "Pixie", src: "assets/hair/pixie.svg" },
  { id: "bob", label: "Bob", src: "assets/hair/bob.svg" },
  { id: "straight", label: "Straight", src: "assets/hair/long-straight.svg" },
  { id: "waves", label: "Waves", src: "assets/hair/long-waves.svg" },
  { id: "curls", label: "Curls", src: "assets/hair/curls.svg" },
  { id: "braids", label: "Braids", src: "assets/hair/braids.svg" },
  { id: "fade", label: "High-top", src: "assets/hair/fade.svg" },
  { id: "bun", label: "Bun", src: "assets/hair/bun.svg" },
];

export const HAIR_COLORS = [
  { id: "black", label: "Black", hex: "#1a1412" },
  { id: "dark-brown", label: "Dark Brown", hex: "#3a2418" },
  { id: "light-brown", label: "Light Brown", hex: "#8a5a32" },
  { id: "blonde", label: "Blonde", hex: "#e2c07a" },
  { id: "auburn", label: "Auburn", hex: "#8f2d1f" },
  { id: "pink", label: "Pink", hex: "#e56aa6" },
];

const svgCache = new Map();

export function hairStyleById(id) {
  return HAIR_STYLES.find((style) => style.id === id) || HAIR_STYLES[1];
}

export function hairColorById(id) {
  return HAIR_COLORS.find((color) => color.id === id) || HAIR_COLORS[0];
}

export function defaultHairPlacement() {
  return {
    photoId: null,
    styleId: "bob",
    colorId: "black",
    x: 0.5,
    y: 0.46,
    scale: 1,
    rotation: 0,
    stretchX: 1,
    stretchY: 1,
  };
}

function channel(hex) {
  const h = String(hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function mixHex(from, to, amount) {
  const a = channel(from);
  const b = channel(to);
  const mixed = a.map((value, index) => Math.round(value + (b[index] - value) * amount));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** Base color plus a darker shade and a lighter strand color. */
export function hairShades(hex) {
  const base = `#${channel(hex).map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  return {
    base,
    dark: mixHex(base, "#000000", 0.42),
    light: mixHex(base, "#ffffff", 0.48),
  };
}

export function hairFrame(stageW, stageH, placement = {}) {
  const scale = Number(placement.scale) || 1;
  const stretchX = Number(placement.stretchX) || 1;
  const stretchY = Number(placement.stretchY) || 1;
  const baseW = Math.min(stageW, stageH) * 0.86 * scale;
  const baseH = baseW * (HAIR_VIEW_H / HAIR_VIEW_W);
  return {
    w: baseW * stretchX,
    h: baseH * stretchY,
    cx: (Number(placement.x) || 0) * stageW,
    cy: (Number(placement.y) || 0) * stageH,
    rotation: Number(placement.rotation) || 0,
  };
}

export function containRect(boxW, boxH, imageW, imageH) {
  const imageScale = Math.min(boxW / imageW, boxH / imageH);
  const w = imageW * imageScale;
  const h = imageH * imageScale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

export function colorizeHairSvg(svgText, shades) {
  const colored = String(svgText)
    .replaceAll("var(--hair-base)", shades.base)
    .replaceAll("var(--hair-dark)", shades.dark)
    .replaceAll("var(--hair-light)", shades.light);
  return colored.replace(/<svg\b([^>]*)>/, (match, attrs) => {
    if (/\swidth=/.test(attrs)) return match;
    return `<svg width="${HAIR_VIEW_W}" height="${HAIR_VIEW_H}"${attrs}>`;
  });
}

export async function loadHairSvg(src) {
  if (svgCache.has(src)) return svgCache.get(src);
  const response = await fetch(src);
  if (!response.ok) throw new Error("Could not load that hairstyle.");
  const text = await response.text();
  svgCache.set(src, text);
  return text;
}

function loadSvgImage(svgText) {
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not draw that hairstyle."));
    };
    image.src = url;
  });
}

/** Flatten the photo and the hair overlay into one JPEG. Browser only. */
export async function flattenHairCanvas({
  photoImage,
  photoWidth,
  photoHeight,
  svgText,
  shades,
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
  ctx.fillStyle = "#f4e7dc";
  ctx.fillRect(0, 0, width, height);
  const fitted = containRect(width, height, photoWidth, photoHeight);
  ctx.drawImage(photoImage, fitted.x, fitted.y, fitted.w, fitted.h);
  const frame = hairFrame(width, height, placement);
  const hairImage = await loadSvgImage(colorizeHairSvg(svgText, shades));
  ctx.save();
  ctx.translate(frame.cx, frame.cy);
  ctx.rotate((frame.rotation * Math.PI) / 180);
  ctx.drawImage(hairImage, -frame.w / 2, -frame.h / 2, frame.w, frame.h);
  ctx.restore();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("Could not save that hair.");
  return blob;
}
