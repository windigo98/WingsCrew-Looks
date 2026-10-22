/**
 * Similar-piece search for "Upgrade this piece".
 *
 * `runProductSearch({ query, type, color, priceMax })` returns
 * `{ id, title, price, currency, image, url, store, affiliate }`.
 * With no backend URL this is labeled example data. Set `window.WCL_SEARCH_URL`
 * (or pass `url`) and the same call hits that server. Ranking is closeness, then price.
 * Teen mode drops adult sponsored items.
 */
import { wearSlot } from "./placement.js";
import { safeHttpUrl } from "./util.js";

const COLOR_WORDS = new Set([
  "blush", "pink", "rose", "ivory", "cream", "white", "ink", "black", "indigo", "blue",
  "navy", "green", "sage", "peach", "gold", "pearl", "silver", "red", "burgundy",
  "brown", "tan", "beige", "coral",
]);

const STOP_WORDS = new Set(["a", "an", "the", "and", "or", "with", "of", "for", "to", "in", "everyday"]);

const TYPE_WORDS = new Set([
  "hat", "hats", "top", "tops", "bottom", "bottoms", "dress", "dresses", "shoe", "shoes",
  "sneaker", "sneakers", "bag", "bags", "necklace", "necklaces",
  "earring", "earrings", "glass", "glasses",
  "sunglass", "sunglasses", "blazer", "camisole", "blouse", "jeans", "trousers",
  "layer", "layers", "jacket", "extra", "accessory", "jewelry", "outerwear",
]);

const SLOT_LABELS = {
  hat: "Hat",
  top: "Top",
  bottom: "Bottom",
  dress: "Dress",
  outerwear: "Layer",
  shoes: "Shoes",
  bag: "Bag",
  neck: "Necklace",
  ears: "Earrings",
  eyes: "Glasses",
  accessory: "Extra",
};

const QUERY_TYPE = {
  hat: "hat",
  top: "top",
  bottom: "bottom",
  dress: "dress",
  outerwear: "layer",
  shoes: "shoes",
  bag: "bag",
  neck: "necklace",
  ears: "earrings",
  eyes: "glasses",
  accessory: "accessory",
};

const CATEGORY_BY_SLOT = {
  neck: "jewelry",
  ears: "jewelry",
  eyes: "jewelry",
};

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
}

function painted(shapes, accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="280" viewBox="0 0 240 280"><rect width="240" height="280" fill="#f6efe8"/>${shapes.replaceAll("ACCENT", accent)}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const HAT_ART = painted(`<ellipse cx="120" cy="168" rx="86" ry="18" fill="ACCENT"/><path d="M72 164c6-58 30-86 48-86s42 28 48 86" fill="ACCENT"/>`, "#e6c98a");
const FEDORA_ART = painted(`<ellipse cx="120" cy="176" rx="84" ry="16" fill="ACCENT"/><path d="M78 172c8-20 18-64 42-64s34 44 42 64" fill="ACCENT"/>`, "#2a2433");
const TANK_ART = painted(`<path d="M78 70h84l12 28-16 10v112H82V108L66 98z" fill="ACCENT"/>`, "#2a2433");
const FLAT_ART = painted(`<ellipse cx="120" cy="168" rx="70" ry="22" fill="ACCENT"/><path d="M62 160c18-36 40-48 58-48 28 0 52 22 62 48" fill="ACCENT"/>`, "#f3efe4");
const TOTE_ART = painted(`<path d="M70 110h100v110H70z" fill="ACCENT"/><path d="M92 110c0-28 56-28 56 0" fill="none" stroke="ACCENT" stroke-width="8"/>`, "#e6c98a");
const CHAIN_ART = painted(`<path d="M70 78c40 36 60 36 100 0" fill="none" stroke="ACCENT" stroke-width="6"/><circle cx="120" cy="168" r="16" fill="ACCENT"/>`, "#c6a15b");
const CHOKER_ART = painted(`<path d="M58 130c28 40 96 40 124 0" fill="none" stroke="ACCENT" stroke-width="10"/><circle cx="120" cy="150" r="8" fill="#f7f1e4"/>`, "#f4f0e8");
const STUD_ART = painted(`<circle cx="86" cy="140" r="16" fill="ACCENT"/><circle cx="154" cy="140" r="16" fill="#f7f1e4"/>`, "#c6a15b");
const GLASSES_ART = painted(`<circle cx="78" cy="140" r="28" fill="none" stroke="ACCENT" stroke-width="8"/><circle cx="162" cy="140" r="28" fill="none" stroke="ACCENT" stroke-width="8"/><path d="M106 140h28" stroke="ACCENT" stroke-width="8"/>`, "#c6a15b");
const SUNGLASS_ART = painted(`<circle cx="78" cy="140" r="28" fill="ACCENT"/><circle cx="162" cy="140" r="28" fill="ACCENT"/><path d="M106 140h28" stroke="#1c1424" stroke-width="8"/>`, "#2a2433");
const JACKET_ART = painted(`<path d="M70 72l50 20 50-20 18 36-28 12v108H80V120L52 108z" fill="ACCENT"/>`, "#f3efe4");
const SLIP_ART = painted(`<path d="M86 64h68l10 150H76z" fill="ACCENT"/>`, "#2a2433");

function exampleItem(item) {
  return {
    currency: "USD",
    store: "Example Market",
    affiliate: false,
    color: "",
    tags: [],
    adultSponsored: false,
    ...item,
  };
}

/** Clearly fake catalog. A few items per wear slot. Not a live store. */
export const EXAMPLE_ITEMS = [
  exampleItem({ id: "ex-straw-sun", title: "Woven straw sun hat", price: 34, image: "assets/samples/straw-hat.svg", url: "https://example.com/shop/straw-sun-hat", type: "hat", tags: ["hat", "straw", "summer", "texas", "sun"] }),
  exampleItem({ id: "ex-straw-visor", title: "Straw visor", price: 18, image: HAT_ART, url: "https://example.com/shop/straw-visor", store: "Example Atelier", type: "hat", tags: ["hat", "straw"] }),
  exampleItem({ id: "ex-felt-fedora", title: "Black felt fedora", price: 48, image: FEDORA_ART, url: "https://example.com/shop/felt-fedora", type: "hat", color: "black", tags: ["hat", "black", "felt"] }),

  exampleItem({ id: "ex-blush-cami", title: "Blush silk camisole", price: 36, image: "assets/samples/blush-camisole.svg", url: "https://example.com/shop/blush-camisole", type: "top", color: "blush", tags: ["top", "blush", "silk", "date", "night"] }),
  exampleItem({ id: "ex-ivory-blouse", title: "Ivory cotton blouse", price: 42, image: "assets/samples/ivory-blouse.svg", url: "https://example.com/shop/ivory-blouse", type: "top", color: "ivory", tags: ["top", "ivory", "interview"] }),
  exampleItem({ id: "ex-ink-tank", title: "Ink ribbed tank", price: 24, image: TANK_ART, url: "https://example.com/shop/ink-tank", type: "top", color: "ink", tags: ["top", "ink", "black"] }),

  exampleItem({ id: "ex-indigo-jeans", title: "Indigo straight jeans", price: 58, image: "assets/samples/indigo-jeans.svg", url: "https://example.com/shop/indigo-jeans", type: "bottom", color: "indigo", tags: ["bottom", "indigo", "jeans"] }),
  exampleItem({ id: "ex-cream-trousers", title: "Cream tailored trousers", price: 72, image: "assets/samples/cream-trousers.svg", url: "https://example.com/shop/cream-trousers", type: "bottom", color: "cream", tags: ["bottom", "cream", "interview"] }),

  exampleItem({ id: "ex-garden-midi", title: "Garden floral midi", price: 88, image: "assets/samples/garden-midi.svg", url: "https://example.com/shop/garden-midi", type: "dress", color: "green", tags: ["dress", "garden", "midi", "floral", "wedding", "guest"] }),
  exampleItem({ id: "ex-peach-sundress", title: "Peach cotton sundress", price: 46, image: "assets/samples/peach-sundress.svg", url: "https://example.com/shop/peach-sundress", type: "dress", color: "peach", tags: ["dress", "peach", "summer", "texas"] }),
  exampleItem({ id: "ex-after-hours", title: "After-hours slip", price: 64, image: SLIP_ART, url: "https://example.com/shop/after-hours-slip", type: "dress", color: "black", tags: ["dress", "black"], adultSponsored: true, audience: "18+", sponsorCategory: "adult" }),

  exampleItem({ id: "ex-ink-blazer", title: "Ink tailored blazer", price: 128, image: "assets/samples/ink-blazer.svg", url: "https://example.com/shop/ink-blazer", type: "outerwear", color: "ink", tags: ["outerwear", "layer", "ink", "blazer", "interview"] }),
  exampleItem({ id: "ex-cream-jacket", title: "Cream linen jacket", price: 96, image: JACKET_ART, url: "https://example.com/shop/cream-jacket", type: "outerwear", color: "cream", tags: ["outerwear", "layer", "cream", "jacket"] }),

  exampleItem({ id: "ex-white-sneakers", title: "White leather sneakers", price: 68, image: "assets/samples/white-sneakers.svg", url: "https://example.com/shop/white-sneakers", type: "shoes", color: "white", tags: ["shoes", "white", "sneakers"] }),
  exampleItem({ id: "ex-ivory-flats", title: "Ivory ballet flats", price: 54, image: FLAT_ART, url: "https://example.com/shop/ivory-flats", type: "shoes", color: "ivory", tags: ["shoes", "ivory", "flats"] }),

  exampleItem({ id: "ex-mini-bag", title: "Mini evening bag", price: 42, image: "assets/samples/mini-bag.svg", url: "https://example.com/shop/mini-bag", type: "bag", tags: ["bag", "mini", "date", "night"] }),
  exampleItem({ id: "ex-straw-tote", title: "Straw market tote", price: 36, image: TOTE_ART, url: "https://example.com/shop/straw-tote", type: "bag", tags: ["bag", "straw", "summer", "tote"] }),

  exampleItem({ id: "ex-pearl-strand", title: "Classic pearl strand", price: 52, image: "assets/samples/pearl-strand.svg", url: "https://example.com/shop/pearl-strand", type: "neck", color: "pearl", tags: ["neck", "necklace", "pearl", "strand", "wedding"] }),
  exampleItem({ id: "ex-gold-chain", title: "Fine gold chain", price: 38, image: CHAIN_ART, url: "https://example.com/shop/gold-chain", type: "neck", color: "gold", tags: ["neck", "necklace", "gold", "chain"] }),
  exampleItem({ id: "ex-pearl-choker", title: "Pearl choker", price: 44, image: CHOKER_ART, url: "https://example.com/shop/pearl-choker", type: "neck", color: "pearl", tags: ["neck", "necklace", "pearl", "choker"] }),

  exampleItem({ id: "ex-gold-hoops", title: "Medium gold hoops", price: 28, image: "assets/samples/gold-hoops.svg", url: "https://example.com/shop/gold-hoops", type: "ears", color: "gold", tags: ["ears", "earrings", "gold", "hoops"] }),
  exampleItem({ id: "ex-pearl-studs", title: "Pearl stud earrings", price: 22, image: STUD_ART, url: "https://example.com/shop/pearl-studs", type: "ears", color: "pearl", tags: ["ears", "earrings", "pearl", "stud"] }),

  exampleItem({ id: "ex-gold-glasses", title: "Gold frame glasses", price: 46, image: GLASSES_ART, url: "https://example.com/shop/gold-glasses", type: "eyes", color: "gold", tags: ["eyes", "glasses", "gold"] }),
  exampleItem({ id: "ex-ink-sunglasses", title: "Ink round sunglasses", price: 32, image: SUNGLASS_ART, url: "https://example.com/shop/ink-sunglasses", type: "eyes", color: "ink", tags: ["eyes", "glasses", "sunglasses", "ink"] }),
  exampleItem({ id: "ex-adult-glasses", title: "After-hours tinted glasses", price: 40, image: SUNGLASS_ART, url: "https://example.com/shop/after-hours-glasses", type: "eyes", tags: ["eyes", "glasses"], adultSponsored: true, audience: "18+", sponsorCategory: "adult" }),
];

export function slotLabel(type) {
  return SLOT_LABELS[type] || "Piece";
}

export function categoryForSlot(type) {
  if (CATEGORY_BY_SLOT[type]) return CATEGORY_BY_SLOT[type];
  if (SLOT_LABELS[type] && type !== "neck" && type !== "ears" && type !== "eyes") {
    return ["hat", "top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"].includes(type) ? type : "other";
  }
  return "other";
}

/** Type, color, and style words taken from the piece name and occasion. */
export function pieceQuery(layer) {
  const type = wearSlot(layer || {});
  const words = tokenize(`${layer?.name || ""} ${String(layer?.occasion || "").replaceAll("-", " ")}`);
  const color = words.find((word) => COLOR_WORDS.has(word)) || "";
  const style = [];
  for (const word of words) {
    if (word === color || STOP_WORDS.has(word) || TYPE_WORDS.has(word)) continue;
    if (!style.includes(word)) style.push(word);
  }
  const spoken = QUERY_TYPE[type] || type;
  const query = [];
  for (const part of [spoken, type !== spoken ? type : "", color, ...style]) {
    if (part && !query.includes(part)) query.push(part);
  }
  return { query: query.join(" "), type, color, style, slotLabel: slotLabel(type) };
}

export function formatPrice(price, currency = "USD") {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return "";
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  if (!currency || currency === "USD") return `$${text}`;
  return `${currency} ${text}`;
}

export function configuredSearchUrl(override) {
  if (override) return String(override);
  if (typeof window !== "undefined" && window.WCL_SEARCH_URL) return String(window.WCL_SEARCH_URL);
  return "";
}

export function usesExampleCatalog(options = {}) {
  return !configuredSearchUrl(options.url);
}

function isAdultSponsored(item) {
  return Boolean(item?.adultSponsored || item?.audience === "18+" || (item?.sponsored && item?.sponsorCategory === "adult"));
}

export function closenessScore(item, request) {
  const type = String(request?.type || "").toLowerCase();
  const color = String(request?.color || "").toLowerCase();
  const hay = new Set([
    ...tokenize(item.title),
    ...tokenize(item.type),
    ...tokenize(item.color),
    ...(item.tags || []).map((tag) => String(tag).toLowerCase()),
  ]);
  let score = 0;
  if (type && (item.type === type || hay.has(type))) score += 6;
  if (color && (item.color === color || hay.has(color))) score += 3;
  for (const token of tokenize(request?.query)) {
    if (token === type || token === color) continue;
    if (hay.has(token)) score += 2;
  }
  return score;
}

function publicItem(item) {
  return {
    id: item.id,
    title: item.title,
    price: item.price,
    currency: item.currency || "USD",
    image: item.image || "",
    url: safeHttpUrl(item.url),
    store: item.store || "",
    affiliate: Boolean(item.affiliate),
    color: item.color || "",
    type: item.type || "",
  };
}

function sameType(item, type) {
  if (!type) return true;
  const names = new Set([type, QUERY_TYPE[type]].filter(Boolean));
  if (names.has(item.type)) return true;
  const hay = new Set([...tokenize(item.title), ...tokenize(item.type), ...(item.tags || []).map((tag) => String(tag).toLowerCase())]);
  for (const name of names) {
    if (hay.has(name)) return true;
  }
  return false;
}

export function rankProducts(items, request = {}) {
  const teen = Boolean(request.teen);
  const type = String(request?.type || "").toLowerCase();
  const max = request.priceMax == null || request.priceMax === "" ? null : Number(request.priceMax);
  const ranked = [];
  for (const raw of items || []) {
    const item = normalizeItem(raw);
    if (!item) continue;
    if (teen && isAdultSponsored(raw)) continue;
    if (!sameType(item, type)) continue;
    if (max != null && Number.isFinite(max) && item.price > max) continue;
    const score = closenessScore(item, request);
    if (score <= 0) continue;
    ranked.push({ item, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.item.price - b.item.price || a.item.title.localeCompare(b.item.title));
  return ranked.map((row) => publicItem(row.item));
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title || "").trim();
  const id = String(raw.id || "").trim();
  const price = Number(raw.price);
  if (!id || !title || !Number.isFinite(price)) return null;
  const tags = Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag).toLowerCase()) : tokenize(`${raw.title} ${raw.type || ""}`);
  return {
    id,
    title,
    price,
    currency: String(raw.currency || "USD"),
    image: String(raw.image || ""),
    url: String(raw.url || ""),
    store: String(raw.store || ""),
    affiliate: Boolean(raw.affiliate),
    type: String(raw.type || "").toLowerCase(),
    color: String(raw.color || "").toLowerCase(),
    tags,
  };
}

function listFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

export async function fetchRemoteProducts(request, { url, fetchImpl }) {
  const endpoint = configuredSearchUrl(url);
  if (!endpoint || typeof fetchImpl !== "function") return [];
  let target;
  try {
    target = new URL(endpoint);
  } catch {
    return [];
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return [];
  for (const key of ["query", "type", "color"]) {
    if (request?.[key]) target.searchParams.set(key, String(request[key]));
  }
  if (request?.priceMax != null && request.priceMax !== "") target.searchParams.set("priceMax", String(request.priceMax));
  try {
    const init = {};
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") init.signal = AbortSignal.timeout(8000);
    const response = await fetchImpl(target.href, init);
    if (!response?.ok) return [];
    const payload = await response.json();
    return listFromPayload(payload);
  } catch {
    return [];
  }
}

/**
 * Demo catalog, unless `url` / `window.WCL_SEARCH_URL` is set or `source` is "remote".
 * @returns {Promise<Array<{id:string,title:string,price:number,currency:string,image:string,url:string,store:string,affiliate:boolean}>>}
 */
export async function runProductSearch(request = {}, options = {}) {
  const url = configuredSearchUrl(options.url);
  if (options.source === "remote" || url) {
    if (!url) return [];
    const fetched = await fetchRemoteProducts(request, { url, fetchImpl: options.fetchImpl || globalThis.fetch });
    return rankProducts(fetched, request);
  }
  return rankProducts(EXAMPLE_ITEMS, request);
}
