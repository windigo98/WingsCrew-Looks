/** Default sticker placement, as fractions of the photo. */
export function defaultPlacement(category) {
  switch (category) {
    case "top":
      return { x: 0.5, y: 0.36, scale: 0.92 };
    case "bottom":
      return { x: 0.5, y: 0.7, scale: 1 };
    case "dress":
      return { x: 0.5, y: 0.5, scale: 1.15 };
    case "outerwear":
      return { x: 0.5, y: 0.4, scale: 1.12 };
    case "shoes":
      return { x: 0.5, y: 0.9, scale: 0.58 };
    case "hat":
      return { x: 0.5, y: 0.1, scale: 0.5 };
    case "bag":
      return { x: 0.73, y: 0.56, scale: 0.4 };
    case "jewelry":
      return { x: 0.5, y: 0.22, scale: 0.38 };
    default:
      return { x: 0.5, y: 0.48, scale: 0.8 };
  }
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
