/**
 * Wishlist records are private on this device.
 * Field names match a later shared registry: variants can be claimed,
 * places can be online or nearby, and sharing stays "private" until a backend exists.
 */
import { clean, mapsSearchUrl, parsePrice, safeHttpUrl, splitList, uid } from "./util.js";

function addVariant(list, seen, { size, color, role, previous }) {
  const key = `${size}||${color}`;
  if (seen.has(key)) return;
  seen.add(key);
  const match = previous?.find((variant) => variant.size === size && variant.color === color);
  list.push({
    id: match?.id || uid("var"),
    size,
    color,
    role,
    status: match?.status || "available",
    claim: match?.claim || null,
    purchased: match?.purchased || null,
  });
}

/**
 * @param {object} input form fields plus optional id, createdAt, lookId, itemId, variants
 * @param {number} [now]
 */
export function buildWishlistRecord(input, now = Date.now()) {
  const name = clean(input.name, 80);
  if (!name) {
    const error = new Error("Add a name for this piece.");
    error.code = "name";
    throw error;
  }

  const sizeFirst = clean(input.sizeFirst, 40);
  const colorFirst = clean(input.colorFirst, 40);
  const altSizes = splitList(input.altSizes).filter((size) => size.toLowerCase() !== sizeFirst.toLowerCase());
  const altColors = splitList(input.altColors).filter((color) => color.toLowerCase() !== colorFirst.toLowerCase());
  const previous = Array.isArray(input.variants) ? input.variants : [];
  const variants = [];
  const seen = new Set();

  addVariant(variants, seen, { size: sizeFirst, color: colorFirst, role: "first", previous });
  for (const size of altSizes) {
    addVariant(variants, seen, { size, color: colorFirst, role: "alternate", previous });
  }
  for (const color of altColors) {
    addVariant(variants, seen, { size: sizeFirst, color, role: "alternate", previous });
  }

  const places = [];
  const link = safeHttpUrl(input.link);
  const onlineStore = clean(input.onlineStore || input.store, 80);
  if (link || onlineStore) {
    const previousOnline = previousPlace(input.places, "online");
    places.push({
      id: previousOnline?.id || uid("place"),
      kind: "online",
      store: onlineStore,
      url: link,
      priceDisplay: clean(input.price, 40),
    });
  }

  const nearbyStore = clean(input.nearbyStore, 80);
  const address = clean(input.address, 240);
  const nearbyNote = clean(input.nearbyNote, 240);
  if (nearbyStore || address || nearbyNote) {
    const previousNearby = previousPlace(input.places, "nearby");
    places.push({
      id: previousNearby?.id || uid("place"),
      kind: "nearby",
      store: nearbyStore,
      address,
      note: nearbyNote,
      mapsUrl: address ? mapsSearchUrl(address) : "",
    });
  }

  const metal = clean(input.metal, 40);
  const finishStone = clean(input.finishStone, 80);
  const sizeOrLength = clean(input.jewelrySize, 40);
  const jewelry = metal || finishStone || sizeOrLength
    ? { metal, finishStone, sizeOrLength }
    : null;

  return {
    id: input.id || uid("wish"),
    name,
    category: clean(input.category, 40) || "other",
    store: clean(input.store, 80),
    priceDisplay: clean(input.price, 40),
    priceAmount: parsePrice(input.price),
    currency: "USD",
    fitNotes: clean(input.fitNotes, 500),
    privacy: "private",
    quantity: 1,
    variants,
    places,
    jewelry,
    lookId: input.lookId || null,
    itemId: input.itemId || null,
    createdAt: input.createdAt || now,
    updatedAt: now,
    sharing: {
      mode: "private",
      showSizeBeforeClaim: false,
    },
  };
}

function previousPlace(places, kind) {
  return Array.isArray(places) ? places.find((place) => place.kind === kind) : null;
}

/** Flatten a stored record back into form fields. */
export function wishlistToForm(record) {
  const first = record.variants?.find((variant) => variant.role === "first") || record.variants?.[0] || { size: "", color: "" };
  const altSizes = [];
  const altColors = [];
  for (const variant of record.variants || []) {
    if (variant.role !== "alternate") continue;
    if (variant.size && variant.size !== first.size && variant.color === first.color) altSizes.push(variant.size);
    if (variant.color && variant.color !== first.color && variant.size === first.size) altColors.push(variant.color);
  }
  const online = previousPlace(record.places, "online");
  const nearby = previousPlace(record.places, "nearby");
  return {
    id: record.id,
    createdAt: record.createdAt,
    lookId: record.lookId || "",
    itemId: record.itemId || "",
    name: record.name || "",
    category: record.category || "other",
    store: record.store || online?.store || "",
    price: record.priceDisplay || "",
    sizeFirst: first.size || "",
    colorFirst: first.color || "",
    altSizes: altSizes.join(", "),
    altColors: altColors.join(", "),
    fitNotes: record.fitNotes || "",
    link: online?.url || "",
    onlineStore: online?.store || "",
    nearbyStore: nearby?.store || "",
    address: nearby?.address || "",
    nearbyNote: nearby?.note || "",
    metal: record.jewelry?.metal || "",
    finishStone: record.jewelry?.finishStone || "",
    jewelrySize: record.jewelry?.sizeOrLength || "",
    variants: record.variants || [],
    places: record.places || [],
  };
}

export function firstChoice(record) {
  return record.variants?.find((variant) => variant.role === "first") || record.variants?.[0] || null;
}
