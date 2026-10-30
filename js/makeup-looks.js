/**
 * Makeup looks for the Makeup tab: the layers, the shades, and the 2026 preset
 * looks. Plain data plus a resolver, so it runs in Node tests too.
 *
 * A look is one setting per layer: { amount (0 = off, 1 = full), shade, style }.
 * Presets fill in all the layers; the custom pickers override one layer at a time.
 */

/** Layers, bottom to top in the order they are painted. */
export const MAKEUP_LAYERS = [
  { id: "skin", label: "Skin", hint: "Takes down shine and evens tone. Keeps pores and texture.", styles: [] },
  { id: "bronzer", label: "Bronzer", hint: "Warmth on the high points, or a contour under the cheekbones.", styles: [["bronze", "Bronze"], ["contour", "Contour"]] },
  { id: "blush", label: "Blush", hint: "Sheer color that lets your skin show through.", styles: [["apple", "Apples"], ["lifted", "Lifted"], ["cherub", "Cherub"]] },
  { id: "highlight", label: "Highlight", hint: "Glow on the cheekbones, nose, and cupid's bow.", styles: [] },
  { id: "freckles", label: "Freckles", hint: "Soft faux freckles over the nose and cheeks.", styles: [] },
  { id: "shadow", label: "Eyeshadow", hint: "Lid, crease, or both. The crease shade sits above the lid.", styles: [["lid", "Lid"], ["crease", "Crease"], ["both", "Lid + crease"], ["smoky", "Smoky"]] },
  { id: "liner", label: "Liner", hint: "Along the upper lash line.", styles: [["thin", "Thin"], ["winged", "Winged"], ["graphic", "Graphic"]] },
  { id: "lashes", label: "Lashes", hint: "Darkens the lash line, like mascara.", styles: [] },
  { id: "brows", label: "Brows", hint: "Fills gaps and tints the hairs you have.", styles: [] },
  { id: "lips", label: "Lips", hint: "Stays inside the lip line and off the teeth.", styles: [["matte", "Matte"], ["satin", "Satin"], ["gloss", "Gloss"]] },
];

export const LAYER_IDS = MAKEUP_LAYERS.map((layer) => layer.id);

/**
 * Shades per layer. Each one is chosen to read on light through deep skin: the
 * painter keeps the skin's own light and shade, so a color deepens on deeper skin
 * instead of sitting on top like paint.
 * "auto" shades are worked out from the photo (brows match the brow hair,
 * bronzer matches the skin depth, balm deepens the natural lip).
 */
export const MAKEUP_SHADES = {
  lips: [
    { id: "nude-rose", label: "Nude Rose", hex: "#b06f68" },
    { id: "latte", label: "Latte Nude", hex: "#9a5d4a" },
    { id: "soft-pink", label: "Soft Pink", hex: "#d26a82" },
    { id: "coral", label: "Coral", hex: "#e0604a" },
    { id: "red", label: "Classic Red", hex: "#9b1b2a" },
    { id: "brick", label: "Brick", hex: "#8c2f24" },
    { id: "berry", label: "Berry", hex: "#6e1a38" },
    { id: "cherry-cola", label: "Cherry Cola", hex: "#561926" },
    { id: "balm", label: "Tinted Balm", hex: "#a86a64", auto: true },
  ],
  blush: [
    { id: "peach", label: "Peach", hex: "#f2a07a" },
    { id: "rose", label: "Rose", hex: "#e2748c" },
    { id: "coral", label: "Coral", hex: "#f07560" },
    { id: "berry", label: "Berry", hex: "#b8456c" },
    { id: "terracotta", label: "Terracotta", hex: "#c4664a" },
    { id: "plum", label: "Plum", hex: "#8c3e60" },
  ],
  bronzer: [
    { id: "auto", label: "Match me", hex: "#a8714f", auto: true },
    { id: "light", label: "Light", hex: "#c48a62" },
    { id: "medium", label: "Medium", hex: "#a0663f" },
    { id: "deep", label: "Deep", hex: "#6e3f25" },
    { id: "taupe", label: "Cool Taupe", hex: "#8a6f62" },
  ],
  highlight: [
    { id: "pearl", label: "Pearl", hex: "#fbf0ea" },
    { id: "champagne", label: "Champagne", hex: "#f6dcb4" },
    { id: "gold", label: "Gold", hex: "#e9be78" },
    { id: "rose-gold", label: "Rose Gold", hex: "#efb3a0" },
  ],
  freckles: [
    { id: "soft-brown", label: "Soft Brown", hex: "#8a5a3e" },
    { id: "deep-brown", label: "Deep Brown", hex: "#5a3524" },
  ],
  shadow: [
    { id: "champagne", label: "Champagne", hex: "#e6c9a4" },
    { id: "taupe", label: "Taupe", hex: "#957e70" },
    { id: "bronze", label: "Bronze", hex: "#a2672f" },
    { id: "copper", label: "Copper", hex: "#c0592c" },
    { id: "plum", label: "Plum", hex: "#6c3558" },
    { id: "charcoal", label: "Charcoal", hex: "#38323a" },
    { id: "sky", label: "Sky Blue", hex: "#5f9fe0" },
    { id: "fuchsia", label: "Fuchsia", hex: "#c2337e" },
  ],
  liner: [
    { id: "black", label: "Black", hex: "#141014" },
    { id: "brown", label: "Brown", hex: "#3e2618" },
    { id: "navy", label: "Navy", hex: "#1c2a5a" },
    { id: "plum", label: "Plum", hex: "#3e1834" },
  ],
  lashes: [
    { id: "black", label: "Black", hex: "#120e10" },
    { id: "brown", label: "Brown", hex: "#2e1d14" },
  ],
  brows: [
    { id: "auto", label: "Match me", hex: "#4a3628", auto: true },
    { id: "taupe", label: "Taupe", hex: "#7a6555" },
    { id: "soft-brown", label: "Soft Brown", hex: "#5e4130" },
    { id: "dark-brown", label: "Dark Brown", hex: "#3a271c" },
    { id: "soft-black", label: "Soft Black", hex: "#1f1a1a" },
  ],
  skin: [],
};

/** Settings for a layer that is off. */
const OFF = { amount: 0 };

function layer(amount, shade, style, extra = {}) {
  return { amount, shade, style, ...extra };
}

/**
 * Preset looks, 2026. `for` is who the look is shown to first; every look works
 * on every face. Sources for the trend names are in docs/makeup.md.
 */
export const MAKEUP_LOOKS = [
  {
    id: "none",
    label: "No makeup",
    for: ["women", "men"],
    blurb: "Just the photo.",
    layers: {},
  },
  {
    id: "natural",
    label: "Natural / No-Makeup",
    for: ["women"],
    blurb: "Your skin, a little fresher: sheer lip, soft cheek, groomed brows.",
    layers: {
      skin: layer(0.35),
      blush: layer(0.3, "peach", "apple"),
      highlight: layer(0.18, "pearl"),
      brows: layer(0.32, "auto"),
      lashes: layer(0.35, "brown"),
      lips: layer(0.28, "nude-rose", "satin"),
    },
  },
  {
    id: "soft-glam",
    label: "Soft Glam",
    for: ["women"],
    blurb: "Warm taupe eyes, soft contour, a rosy satin lip.",
    layers: {
      skin: layer(0.35),
      bronzer: layer(0.38, "auto", "contour"),
      blush: layer(0.42, "rose", "lifted"),
      highlight: layer(0.4, "champagne"),
      shadow: layer(0.55, "taupe", "both", { crease: "bronze" }),
      liner: layer(0.6, "brown", "winged"),
      lashes: layer(0.75, "black"),
      brows: layer(0.48, "auto"),
      lips: layer(0.62, "nude-rose", "satin"),
    },
  },
  {
    id: "clean-girl",
    label: "Clean Girl Glow",
    for: ["women"],
    blurb: "Pearly skin, brushed-up brows, a balmy lip.",
    layers: {
      skin: layer(0.25),
      bronzer: layer(0.2, "auto", "bronze"),
      blush: layer(0.34, "peach", "lifted"),
      highlight: layer(0.58, "pearl"),
      brows: layer(0.5, "auto"),
      lashes: layer(0.4, "brown"),
      lips: layer(0.55, "balm", "gloss"),
    },
  },
  {
    id: "bold-red",
    label: "Bold Red Lip",
    for: ["women"],
    blurb: "Crimson matte lip, bare skin, a fine line of liner.",
    layers: {
      skin: layer(0.4),
      liner: layer(0.5, "black", "thin"),
      lashes: layer(0.6, "black"),
      brows: layer(0.42, "auto"),
      lips: layer(0.92, "red", "matte"),
    },
  },
  {
    id: "smoky",
    label: "Smoky Eye",
    for: ["women"],
    blurb: "Diffused charcoal smoked under the lashes, nude lip.",
    layers: {
      skin: layer(0.35),
      bronzer: layer(0.3, "auto", "contour"),
      shadow: layer(0.78, "charcoal", "smoky", { crease: "taupe" }),
      liner: layer(0.7, "black", "thin"),
      lashes: layer(0.85, "black"),
      brows: layer(0.48, "auto"),
      lips: layer(0.4, "nude-rose", "satin"),
    },
  },
  {
    id: "graphic-wing",
    label: "Graphic Wing Liner",
    for: ["women"],
    blurb: "A sharp extended flick with a quiet lip.",
    layers: {
      skin: layer(0.35),
      liner: layer(0.95, "black", "graphic"),
      lashes: layer(0.75, "black"),
      brows: layer(0.45, "auto"),
      lips: layer(0.42, "nude-rose", "matte"),
    },
  },
  {
    id: "latte",
    label: "Latte Makeup",
    for: ["women"],
    blurb: "Coffee-brown eyes and bronzer, a creamy latte lip.",
    layers: {
      skin: layer(0.3),
      bronzer: layer(0.48, "auto", "bronze"),
      blush: layer(0.3, "terracotta", "lifted"),
      highlight: layer(0.3, "gold"),
      shadow: layer(0.58, "bronze", "both", { crease: "taupe" }),
      liner: layer(0.6, "brown", "winged"),
      lashes: layer(0.65, "brown"),
      brows: layer(0.45, "auto"),
      lips: layer(0.6, "latte", "satin"),
    },
  },
  {
    id: "cherub-blush",
    label: "Douyin / Cherub Blush",
    for: ["women"],
    blurb: "Rosy flush high on the cheeks and over the nose, glossy pink lip.",
    layers: {
      skin: layer(0.25),
      blush: layer(0.6, "rose", "cherub"),
      highlight: layer(0.35, "pearl"),
      shadow: layer(0.38, "champagne", "lid"),
      lashes: layer(0.6, "brown"),
      brows: layer(0.35, "auto"),
      lips: layer(0.58, "soft-pink", "gloss"),
    },
  },
  {
    id: "sunset",
    label: "Sunset Eyes",
    for: ["women"],
    blurb: "Copper on the lid melting into fuchsia, coral lip.",
    layers: {
      skin: layer(0.3),
      blush: layer(0.34, "coral", "lifted"),
      shadow: layer(0.72, "copper", "both", { crease: "fuchsia" }),
      liner: layer(0.4, "brown", "thin"),
      lashes: layer(0.7, "black"),
      brows: layer(0.45, "auto"),
      lips: layer(0.48, "coral", "satin"),
    },
  },
  {
    id: "glossy-berry",
    label: "Glossy Berry Lip",
    for: ["women"],
    blurb: "A deep berry tint with shine; everything else soft.",
    layers: {
      skin: layer(0.3),
      blush: layer(0.3, "berry", "apple"),
      highlight: layer(0.25, "champagne"),
      lashes: layer(0.55, "black"),
      brows: layer(0.4, "auto"),
      lips: layer(0.82, "berry", "gloss"),
    },
  },
  {
    id: "bronzed-summer",
    label: "Bronzed Summer",
    for: ["women", "men"],
    blurb: "Sun-warmed bronze, golden glow, a few freckles.",
    layers: {
      skin: layer(0.25),
      bronzer: layer(0.6, "auto", "bronze"),
      blush: layer(0.22, "terracotta", "lifted"),
      highlight: layer(0.48, "gold"),
      freckles: layer(0.5, "soft-brown"),
      shadow: layer(0.35, "bronze", "lid"),
      lashes: layer(0.5, "brown"),
      brows: layer(0.4, "auto"),
      lips: layer(0.45, "latte", "gloss"),
    },
  },
  {
    id: "editorial-pop",
    label: "Editorial Pop of Color",
    for: ["women"],
    blurb: "A sky-blue wash from lash to crease, bare skin, soft lip.",
    layers: {
      skin: layer(0.35),
      shadow: layer(0.8, "sky", "lid", { height: 1.25 }),
      lashes: layer(0.75, "black"),
      brows: layer(0.45, "auto"),
      lips: layer(0.32, "soft-pink", "satin"),
    },
  },
  {
    id: "groomed-natural",
    label: "Groomed Natural",
    for: ["men"],
    blurb: "Less shine, tidy brows, a touch of balm. Reads as no makeup.",
    layers: {
      skin: layer(0.5),
      bronzer: layer(0.14, "auto", "bronze"),
      brows: layer(0.28, "auto"),
      lips: layer(0.3, "balm", "satin"),
    },
  },
  {
    id: "brow-tidy",
    label: "Brow Tidy",
    for: ["men"],
    blurb: "Fuller, even brows, nothing else.",
    layers: {
      brows: layer(0.5, "auto"),
    },
  },
  {
    id: "matte-skin",
    label: "Matte Skin",
    for: ["men"],
    blurb: "Shine off the forehead, nose, and cheeks; tone evened.",
    layers: {
      skin: layer(0.85),
    },
  },
  {
    id: "sharp-groomed",
    label: "Sharp & Groomed",
    for: ["men"],
    blurb: "Matte skin, a soft contour, defined brows.",
    layers: {
      skin: layer(0.6),
      bronzer: layer(0.32, "auto", "contour"),
      brows: layer(0.42, "auto"),
      lashes: layer(0.25, "brown"),
      lips: layer(0.25, "balm", "matte"),
    },
  },
];

export const MAKEUP_AUDIENCES = [
  { id: "women", label: "Looks" },
  { id: "men", label: "Groomed" },
];

export function lookById(id) {
  return MAKEUP_LOOKS.find((look) => look.id === id) || MAKEUP_LOOKS[0];
}

export function looksFor(audience) {
  return MAKEUP_LOOKS.filter((look) => look.id !== "none" && look.for.includes(audience));
}

export function layerById(id) {
  return MAKEUP_LAYERS.find((item) => item.id === id) || null;
}

export function shadesFor(layerId) {
  return MAKEUP_SHADES[layerId] || [];
}

export function shadeById(layerId, id) {
  const list = shadesFor(layerId);
  return list.find((shade) => shade.id === id) || list[0] || null;
}

/** Default shade/style for a layer the user switches on from a blank look. */
export function defaultLayer(layerId) {
  const item = layerById(layerId);
  const shade = shadesFor(layerId)[0];
  return {
    amount: 0.5,
    shade: shade ? shade.id : undefined,
    style: item?.styles?.[0]?.[0],
  };
}

/**
 * The full set of layer settings for a preset plus the user's changes.
 * `custom` is { [layerId]: { amount?, shade?, style?, crease? } }.
 * Every layer comes back, with amount clamped to 0..1 and a valid shade/style.
 */
export function resolveLook(lookId, custom = {}) {
  const preset = lookById(lookId);
  const out = {};
  for (const item of MAKEUP_LAYERS) {
    const base = preset.layers[item.id] || OFF;
    const change = custom && typeof custom === "object" ? custom[item.id] : null;
    const merged = { ...(base.amount ? base : { ...defaultLayer(item.id), amount: 0 }), ...(change || {}) };
    const amount = Math.max(0, Math.min(1, Number(merged.amount) || 0));
    const shade = shadesFor(item.id).length ? shadeById(item.id, merged.shade).id : undefined;
    const styles = item.styles.map(([id]) => id);
    const style = styles.length ? (styles.includes(merged.style) ? merged.style : styles[0]) : undefined;
    const entry = { amount, shade, style };
    if (item.id === "shadow") {
      entry.crease = shadeById("shadow", merged.crease || merged.shade).id;
      entry.height = Math.max(0.6, Math.min(1.5, Number(merged.height) || 1));
    }
    out[item.id] = entry;
  }
  return out;
}

/** True when nothing would be painted. */
export function isBare(resolved) {
  return Object.values(resolved || {}).every((entry) => !entry || !(entry.amount > 0));
}

/** A short name for a saved look, e.g. "Soft Glam" or "Soft Glam (edited)". */
export function lookName(lookId, custom) {
  const preset = lookById(lookId);
  const edited = custom && Object.keys(custom).length > 0;
  if (preset.id === "none") return edited ? "Custom makeup" : "No makeup";
  return edited ? `${preset.label} (edited)` : preset.label;
}
