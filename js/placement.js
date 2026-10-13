/**
 * Default sticker placement.
 * x and y are the center of the piece, as fractions of the photo.
 * scale is the piece's height as a fraction of the photo height.
 * Full-body anchors keep clothes below the chin. Hats, glasses,
 * necklaces, and earrings are sized from the face.
 *
 * Version 2 stored the same field as a height fraction, but version 1
 * stored a multiplier of about 42% of the photo width (usually 0.9–1.2).
 * Reading those old numbers as a height fraction covers the person.
 */
import { faceMetrics } from "./makeup.js";
import { clamp } from "./util.js";

export const PLACEMENT_VERSION = 3;

/** Anything above this was saved with the old width multiplier. */
export const LEGACY_SCALE = 0.75;

const FULL_BODY = {
  top: { x: 0.5, y: 0.46, scale: 0.18 },
  bottom: { x: 0.5, y: 0.72, scale: 0.34 },
  dress: { x: 0.5, y: 0.58, scale: 0.48 },
  outerwear: { x: 0.5, y: 0.48, scale: 0.22 },
  shoes: { x: 0.5, y: 0.915, scale: 0.06 },
  hat: { x: 0.5, y: 0.07, scale: 0.08 },
  bag: { x: 0.74, y: 0.52, scale: 0.15 },
  jewelry: { x: 0.5, y: 0.34, scale: 0.08 },
  accessory: { x: 0.5, y: 0.5, scale: 0.14 },
};

const SCALE_CAP = {
  top: 0.32,
  bottom: 0.5,
  dress: 0.62,
  outerwear: 0.36,
  shoes: 0.14,
  hat: 0.2,
  bag: 0.28,
  ears: 0.16,
  neck: 0.22,
  eyes: 0.14,
  accessory: 0.28,
};

const FACE_WEAR = new Set(["hat", "ears", "neck", "eyes"]);

export function wearSlot(layer) {
  const category = layer?.category || "accessory";
  if (category === "jewelry" || category === "accessory") return jewelrySlot(layer?.name, layer?.refId);
  return category;
}

function jewelrySlot(name, refId) {
  const text = `${refId || ""} ${name || ""}`.toLowerCase();
  if (/glass|sunglass/.test(text)) return "eyes";
  if (/hoop|earring|stud/.test(text)) return "ears";
  if (/pearl|necklace|chain|strand|choker/.test(text)) return "neck";
  return "neck";
}

/** Slots a new piece takes over. A dress clears the top and the bottom. */
export function slotsReplacedBy(slot) {
  if (slot === "dress") return ["dress", "top", "bottom"];
  if (slot === "top") return ["top", "dress"];
  if (slot === "bottom") return ["bottom", "dress"];
  return [slot];
}

export function scaleCap(layer) {
  if (layer?.kind === "stamp") return 0.08;
  return SCALE_CAP[wearSlot(layer)] || 0.4;
}

export function defaultPlacement(category, photoSlot, layer = {}) {
  const wear = wearSlot({ ...layer, category: layer?.category || category });
  const face = faceMetrics(photoSlot);
  if (face && FACE_WEAR.has(wear)) return anchorToFace(face, wear, photoSlot);

  if (photoSlot === "face" || photoSlot === "demo-face") {
    return { x: face?.cx ?? 0.5, y: 0.88, scale: 0.14 };
  }
  const place = FULL_BODY[category] || { x: 0.5, y: 0.5, scale: 0.2 };
  if (photoSlot === "side" || photoSlot === "demo-side") {
    return { ...place, x: category === "bag" ? 0.78 : place.x === 0.5 ? 0.56 : place.x };
  }
  return { ...place };
}

function anchorToFace(face, wear, photoSlot) {
  const faceHeight = face.ry * 2;
  const close = photoSlot === "face" || photoSlot === "demo-face";
  if (wear === "hat") {
    const scale = Math.min(close ? 0.26 : 0.13, faceHeight * 0.85);
    const y = face.cy - face.ry - scale * 0.12;
    return { x: face.cx, y: clamp(y, scale / 2, 0.98), scale };
  }
  if (wear === "ears") {
    const scale = Math.min(close ? 0.16 : 0.1, faceHeight * 0.55);
    return { x: face.cx, y: face.cy, scale };
  }
  if (wear === "eyes") {
    const scale = Math.min(close ? 0.14 : 0.08, faceHeight * 0.4);
    return { x: face.cx, y: face.cy - face.ry * 0.05, scale };
  }
  const scale = Math.min(close ? 0.18 : 0.12, faceHeight * 0.65);
  const chin = face.cy + face.ry;
  return { x: face.cx, y: clamp(chin + scale / 2, 0.02, 0.98), scale };
}

/**
 * One piece per wear slot. Later pieces win, a dress removes a top and
 * a bottom, and every kept piece is put back on the body at a sane size.
 */
export function normalizeLayers(layers, photoSlot) {
  const kept = [];
  for (const layer of layers || []) {
    if (layer.kind === "stamp") continue;
    const replaced = new Set(slotsReplacedBy(wearSlot(layer)));
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      if (replaced.has(wearSlot(kept[i]))) kept.splice(i, 1);
    }
    const place = defaultPlacement(layer.category, photoSlot, layer);
    kept.push({
      ...layer,
      ...place,
      rotation: 0,
      z: nextLayerZ(kept, layer.category),
    });
  }
  return kept;
}

/**
 * Wear a piece. The same closet item or sample selects the one already
 * on the body. Otherwise the new piece replaces whatever shares its slot.
 */
export function applyWear(layers, incoming, photoSlot) {
  const items = (layers || []).filter((layer) => layer.kind !== "stamp");
  const stamps = (layers || []).filter((layer) => layer.kind === "stamp");
  if (incoming.refId && incoming.source) {
    const existing = items.find((layer) => layer.refId === incoming.refId && layer.source === incoming.source);
    if (existing) return { layers: [...items, ...stamps], selectedId: existing.id, added: false };
  }
  const replaced = new Set(slotsReplacedBy(wearSlot(incoming)));
  const place = defaultPlacement(incoming.category, photoSlot, incoming);
  const nextItems = items.filter((item) => !replaced.has(wearSlot(item)));
  const layer = {
    ...incoming,
    ...place,
    rotation: incoming.rotation || 0,
    flip: incoming.flip ?? 1,
    z: nextLayerZ(nextItems, incoming.category),
  };
  return { layers: [...nextItems, layer, ...stamps], selectedId: layer.id, added: true };
}

export function needsReseat(studio) {
  if (!studio) return false;
  if (studio.placementVersion !== PLACEMENT_VERSION) return true;
  return (studio.layers || []).some((layer) => layer.kind !== "stamp" && (layer.scale || 0) > LEGACY_SCALE);
}

export function nextLayerZ(layers, category) {
  const [min, max] = bandFor(category);
  const inBand = (layers || []).filter((layer) => layer.kind !== "stamp" && (layer.z || 0) >= min && (layer.z || 0) <= max);
  const highest = inBand.reduce((peak, layer) => Math.max(peak, layer.z || 0), min - 1);
  return Math.min(highest + 1, max);
}

function bandFor(category) {
  if (category === "outerwear") return [30, 49];
  if (category === "shoes") return [50, 59];
  if (category === "hat" || category === "jewelry" || category === "bag" || category === "accessory") return [70, 99];
  return [1, 29];
}
