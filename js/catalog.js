export const OCCASIONS = [
  { id: "wedding-guest", label: "Wedding guest" },
  { id: "date-night", label: "Date night" },
  { id: "texas-summer", label: "Texas summer heat" },
  { id: "interview", label: "Interview" },
  { id: "everyday", label: "Everyday" },
];

/**
 * Packs a teen should never see: audience "18+" or a sponsored item in an adult category.
 * Everyday packs stay available. There is no adult artwork in this prototype.
 */
export const PACKS = [
  { id: "everyday", name: "Everyday", audience: "all" },
  { id: "wedding-guest", name: "Wedding guest", audience: "all" },
  { id: "after-hours", name: "After hours", audience: "18+", sponsored: true, sponsorCategory: "adult" },
];

export const CATEGORIES = [
  { id: "top", label: "Top" },
  { id: "bottom", label: "Bottom" },
  { id: "dress", label: "Dress" },
  { id: "outerwear", label: "Layer" },
  { id: "shoes", label: "Shoes" },
  { id: "hat", label: "Hat" },
  { id: "bag", label: "Bag" },
  { id: "jewelry", label: "Jewelry" },
  { id: "accessory", label: "Extra" },
];

export const PHOTO_SLOTS = [
  {
    slot: "front",
    name: "Front",
    guidance: "Head to feet, arms a little away from your sides. Fitted clothes, a plain wall, and soft light. Hold the phone near waist height.",
    facing: "environment",
  },
  {
    slot: "side",
    name: "Side",
    guidance: "Turn to the side and keep your whole body in frame. Same wall, same soft light.",
    facing: "environment",
  },
  {
    slot: "face",
    name: "Face",
    guidance: "A close-up of your face for makeup. Hair off your face if you can, no glasses, calm expression.",
    facing: "user",
  },
];

export const SAMPLES = [
  { id: "sample-camisole", name: "Blush camisole", category: "top", occasion: "date-night", src: "assets/samples/blush-camisole.svg" },
  { id: "sample-blouse", name: "Ivory blouse", category: "top", occasion: "interview", src: "assets/samples/ivory-blouse.svg" },
  { id: "sample-blazer", name: "Ink blazer", category: "outerwear", occasion: "interview", src: "assets/samples/ink-blazer.svg" },
  { id: "sample-jeans", name: "Indigo jeans", category: "bottom", occasion: "everyday", src: "assets/samples/indigo-jeans.svg" },
  { id: "sample-trousers", name: "Cream trousers", category: "bottom", occasion: "interview", src: "assets/samples/cream-trousers.svg" },
  { id: "sample-midi", name: "Garden midi", category: "dress", occasion: "wedding-guest", src: "assets/samples/garden-midi.svg" },
  { id: "sample-sundress", name: "Peach sundress", category: "dress", occasion: "texas-summer", src: "assets/samples/peach-sundress.svg" },
  { id: "sample-hoops", name: "Gold hoops", category: "jewelry", occasion: "date-night", src: "assets/samples/gold-hoops.svg" },
  { id: "sample-pearls", name: "Pearl strand", category: "jewelry", occasion: "wedding-guest", src: "assets/samples/pearl-strand.svg" },
  { id: "sample-hat", name: "Straw hat", category: "hat", occasion: "texas-summer", src: "assets/samples/straw-hat.svg" },
  { id: "sample-bag", name: "Mini bag", category: "bag", occasion: "date-night", src: "assets/samples/mini-bag.svg" },
  { id: "sample-sneakers", name: "White sneakers", category: "shoes", occasion: "everyday", src: "assets/samples/white-sneakers.svg" },
];

export const DEMO_POSES = [
  { slot: "demo-front", name: "Demo front", src: "assets/demo/front.svg" },
  { slot: "demo-side", name: "Demo side", src: "assets/demo/side.svg" },
  { slot: "demo-face", name: "Demo face", src: "assets/demo/face.svg" },
];

/** Bump when the demo drawings change so phones refresh the stored copies. */
export const DEMO_ART_VERSION = 3;

const SLOT_ORDER = ["front", "side", "face", "extra", "demo-front", "demo-side", "demo-face", "sample-face"];

export function sortPhotos(photos) {
  return [...photos].sort((a, b) => {
    const ao = SLOT_ORDER.indexOf(a.slot);
    const bo = SLOT_ORDER.indexOf(b.slot);
    const ai = ao === -1 ? 50 : ao;
    const bi = bo === -1 ? 50 : bo;
    if (ai !== bi) return ai - bi;
    return a.createdAt - b.createdAt;
  });
}

export function occasionLabel(id) {
  return OCCASIONS.find((occasion) => occasion.id === id)?.label || "Everyday";
}

export function categoryLabel(id) {
  if (id === "other") return "Other";
  return CATEGORIES.find((category) => category.id === id)?.label || "Piece";
}

export function sampleById(id) {
  return SAMPLES.find((sample) => sample.id === id) || null;
}
