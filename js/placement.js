/**
 * Default sticker placement.
 * x and y are the center of the piece, as fractions of the photo.
 * scale is the piece's height as a fraction of the photo height.
 * Full-body anchors keep clothes below the chin. A face close-up
 * parks clothes under the chin so they do not cover the face.
 */
export const PLACEMENT_VERSION = 2;

const FULL_BODY = {
  top: { x: 0.5, y: 0.46, scale: 0.18 },
  bottom: { x: 0.5, y: 0.72, scale: 0.34 },
  dress: { x: 0.5, y: 0.58, scale: 0.48 },
  outerwear: { x: 0.5, y: 0.48, scale: 0.22 },
  shoes: { x: 0.5, y: 0.915, scale: 0.06 },
  hat: { x: 0.5, y: 0.07, scale: 0.08 },
  bag: { x: 0.74, y: 0.52, scale: 0.15 },
  jewelry: { x: 0.5, y: 0.2, scale: 0.05 },
  accessory: { x: 0.5, y: 0.5, scale: 0.14 },
};

export function defaultPlacement(category, slot) {
  if (slot === "face" || slot === "demo-face") {
    if (category === "hat") return { x: 0.5, y: 0.14, scale: 0.14 };
    if (category === "jewelry") return { x: 0.5, y: 0.58, scale: 0.1 };
    return { x: 0.5, y: 0.88, scale: 0.14 };
  }
  const place = FULL_BODY[category] || { x: 0.5, y: 0.5, scale: 0.2 };
  if (slot === "side" || slot === "demo-side") {
    return { ...place, x: category === "bag" ? 0.78 : place.x === 0.5 ? 0.56 : place.x };
  }
  return { ...place };
}

export function nextLayerZ(layers, category) {
  const aboveFace = category === "hat" || category === "jewelry" || category === "bag" || category === "accessory";
  if (aboveFace) {
    const max = layers.reduce((highest, layer) => Math.max(highest, layer.z || 0), 0);
    return max + 1;
  }
  const clothing = layers.filter((layer) => layer.kind !== "stamp" && layer.z < 100);
  const maxClothing = clothing.reduce((highest, layer) => Math.max(highest, layer.z || 0), 0);
  return Math.min(maxClothing + 1, 99);
}
