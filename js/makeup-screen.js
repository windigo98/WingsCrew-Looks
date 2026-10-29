/**
 * The Makeup tab. Paints makeup on a practice model or on your own photo, on
 * this phone, with the bundled MediaPipe Face Landmarker. It can stack on the
 * hairstyle picked in the Hair tab, and saves hair + makeup as one look.
 * Nothing is uploaded unless you share the saved look.
 */
import { db } from "./db.js";
import { downscaleImage, loadImage } from "./images.js";
import { detectFace, hairMask } from "./face-fit.js?v=19";
import {
  FACE_SHAPES,
  HAIR_MODELS,
  containRect,
  hairColorById,
  hairColorLut,
  hairFrame,
  hairLookSrc,
  hairStyleById,
  modelAudience,
  recolorHairPixels,
  tintedHairCanvas,
} from "./hair.js?v=19";
import { PLACEMENT_VERSION } from "./placement.js?v=8";
import { isTeen } from "./safety.js";
import { escapeHtml, uid } from "./util.js";
import { paintMakeup } from "./makeup-engine.js";
import {
  MAKEUP_AUDIENCES,
  MAKEUP_LAYERS,
  defaultLayer,
  layerById,
  lookById,
  lookName,
  looksFor,
  resolveLook,
  shadesFor,
} from "./makeup-looks.js";

const MAX_EDGE = 1280;
const STATE_KEY = "makeup";

let ctx = null;
let ms = null;
let token = 0;
let frame = 0;
/** The current source, ready to paint: { key, base (ImageData), landmarks, hair, hairArt, width, height } */
let prepared = null;
const cache = new Map();

function defaults() {
  return { lookId: "soft-glam", custom: {}, layer: "lips", audience: "women", source: null, withHair: true };
}

async function loadState() {
  if (ms) return ms;
  const stored = await db.getMeta(STATE_KEY).catch(() => null);
  ms = { ...defaults(), ...(stored && typeof stored === "object" ? stored : {}) };
  if (!ms.custom || typeof ms.custom !== "object") ms.custom = {};
  return ms;
}

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.setMeta(STATE_KEY, ms).catch(() => {}), 200);
}

/** What the makeup goes on. Follows the Hair tab's pick until you choose here. */
function currentSource() {
  const photos = ctx.getPhotos().filter((photo) => !photo.demo);
  const hair = ctx.getHair();
  let source = ms.source;
  if (source?.kind === "photo" && !photos.some((photo) => photo.id === source.id)) source = null;
  if (source?.kind === "model" && !HAIR_MODELS.some((model) => model.id === source.id)) source = null;
  if (!source) {
    if (hair?.modelId && HAIR_MODELS.some((model) => model.id === hair.modelId)) source = { kind: "model", id: hair.modelId };
    else if (hair?.photoId && photos.some((photo) => photo.id === hair.photoId)) source = { kind: "photo", id: hair.photoId };
    else source = { kind: "model", id: HAIR_MODELS[0].id };
  }
  return source;
}

/** The hair from the Hair tab that can go with this source, or null. */
function hairFor(source) {
  const hair = ctx.getHair();
  if (!hair?.styleId) return null;
  const style = hairStyleById(hair.styleId);
  const color = hairColorById(hair.colorId);
  if (source.kind === "model") {
    const src = hairLookSrc(source.id, style.id);
    return src ? { kind: "portrait", src, style, color } : null;
  }
  if (!hair.modelId && hair.photoId === source.id && hair.fitFor) return { kind: "overlay", style, color, placement: { ...hair } };
  return null;
}

function sourceLabel(source) {
  if (source.kind === "model") return HAIR_MODELS.find((model) => model.id === source.id)?.label || "Model";
  return ctx.getPhotos().find((photo) => photo.id === source.id)?.name || "Your photo";
}

function swatchHtml(layerId, shade, active) {
  return `<button type="button" class="mk-swatch" data-mk="shade" data-id="${shade.id}" aria-pressed="${active}"><i style="background:${shade.hex}">${shade.auto ? "<b>A</b>" : ""}</i>${escapeHtml(shade.label)}</button>`;
}

function layerPanelHtml(resolved) {
  const layer = layerById(ms.layer) || MAKEUP_LAYERS[0];
  const entry = resolved[layer.id];
  const on = entry.amount > 0;
  const shades = shadesFor(layer.id);
  const pct = Math.round(entry.amount * 100);
  return `<div class="mk-panel" id="mk-panel">
    <p class="hint mk-layer-hint">${escapeHtml(layer.hint)}</p>
    ${shades.length ? `<div class="scroller mk-shades" aria-label="${escapeHtml(layer.label)} shades">
      <button type="button" class="mk-swatch" data-mk="off" aria-pressed="${!on}"><i class="mk-off"></i>Off</button>
      ${shades.map((shade) => swatchHtml(layer.id, shade, on && entry.shade === shade.id)).join("")}
    </div>` : `<div class="row"><button type="button" class="btn ghost small" data-mk="off" aria-pressed="${!on}">${on ? "Turn off" : "Off"}</button></div>`}
    ${layer.id === "shadow" && on && (entry.style === "both" || entry.style === "crease" || entry.style === "smoky") ? `<p class="hint mk-sub">Crease shade</p>
    <div class="scroller mk-shades" aria-label="Crease shades">
      ${shades.map((shade) => `<button type="button" class="mk-swatch" data-mk="crease" data-id="${shade.id}" aria-pressed="${entry.crease === shade.id}"><i style="background:${shade.hex}"></i>${escapeHtml(shade.label)}</button>`).join("")}
    </div>` : ""}
    ${layer.styles.length ? `<div class="mk-styles" role="group" aria-label="${escapeHtml(layer.label)} style">
      ${layer.styles.map(([id, label]) => `<button type="button" class="chip ${on && entry.style === id ? "active" : ""}" data-mk="style" data-id="${id}" aria-pressed="${on && entry.style === id}">${escapeHtml(label)}</button>`).join("")}
    </div>` : ""}
    <label class="hair-slider mk-slider">Intensity <b id="mk-amount">${pct}</b>
      <input type="range" min="0" max="100" step="1" value="${pct}" data-mk="amount" aria-label="${escapeHtml(layer.label)} intensity">
    </label>
  </div>`;
}

export function makeupHtml() {
  const source = currentSource();
  const resolved = resolveLook(ms.lookId, ms.custom);
  const hair = hairFor(source);
  const ownPhotos = ctx.getPhotos().filter((photo) => !photo.demo);
  const look = lookById(ms.lookId);
  const audience = MAKEUP_AUDIENCES.some((item) => item.id === ms.audience) ? ms.audience : "women";
  const edited = Object.keys(ms.custom).length > 0;
  const hairNote = hair
    ? `Wearing ${escapeHtml(hair.style.label)} · ${escapeHtml(hair.color.label)} from the Hair tab`
    : source.kind === "model"
      ? "No portrait of this model in your Hair tab style yet."
      : "Fit a style to this photo in the Hair tab to wear it here.";
  return `<section class="hair mk">
    <div class="section-head"><div><h2>Makeup</h2><p class="lede">Pick a look, then make it yours. It's painted on this phone and stays here until you share.</p></div></div>
    <div class="hair-audiences" role="tablist" aria-label="Looks">
      ${MAKEUP_AUDIENCES.map((item) => `<button type="button" class="chip ${item.id === audience ? "active" : ""}" role="tab" data-mk="audience" data-id="${item.id}" aria-selected="${item.id === audience}">${escapeHtml(item.label)}</button>`).join("")}
    </div>
    <div class="scroller mk-looks" aria-label="Makeup looks">
      <button type="button" class="chip ${look.id === "none" && !edited ? "active" : ""}" data-mk="look" data-id="none">No makeup</button>
      ${looksFor(audience).map((item) => `<button type="button" class="chip ${item.id === look.id ? "active" : ""}" data-mk="look" data-id="${item.id}" aria-pressed="${item.id === look.id}">${escapeHtml(item.label)}</button>`).join("")}
    </div>
    <p class="hair-name" id="mk-name">${escapeHtml(lookName(ms.lookId, ms.custom))}</p>
    <div id="mk-stage" class="hair-stage mk-stage" aria-label="Makeup preview">
      <canvas id="mk-canvas" class="mk-canvas" width="3" height="4"></canvas>
      ${source.kind === "photo" ? `<span class="hair-badge">Approximate preview</span>` : ""}
      <button type="button" class="mk-compare" data-mk="compare" aria-label="Hold to see without makeup">Hold: before</button>
    </div>
    <p class="hint hair-tip" id="mk-note" aria-live="polite">${escapeHtml(look.blurb || "")}</p>
    <label class="mk-check"><input type="checkbox" data-mk="with-hair" ${ms.withHair && hair ? "checked" : ""} ${hair ? "" : "disabled"}> Wear my hair pick</label>
    <p class="hint mk-hair-note">${hairNote}</p>
    <h3>Make it yours</h3>
    <div class="scroller mk-layers" role="tablist" aria-label="Makeup layers">
      ${MAKEUP_LAYERS.slice().reverse().map((item) => `<button type="button" class="chip ${item.id === ms.layer ? "active" : ""} ${resolved[item.id].amount > 0 ? "mk-on" : ""}" role="tab" data-mk="layer" data-id="${item.id}" aria-selected="${item.id === ms.layer}">${escapeHtml(item.label)}</button>`).join("")}
    </div>
    ${layerPanelHtml(resolved)}
    ${edited ? `<button type="button" class="btn ghost small" data-mk="reset">Back to ${escapeHtml(look.id === "none" ? "no makeup" : look.label)}</button>` : ""}
    <h3>Pick a model</h3>
    <p class="hint hair-model-note">Made-up people, not real ones. Grouped by face shape.</p>
    <div class="scroller hair-models mk-models" aria-label="Models by face shape">
      ${FACE_SHAPES.map((shape) => `<div class="hair-model-group" role="group" aria-label="${escapeHtml(shape.label)} face">
        <span class="hair-model-shape">${escapeHtml(shape.label)}</span>
        <div class="hair-model-pair">
          ${HAIR_MODELS.filter((model) => model.shape === shape.id).map((model) => `<button type="button" class="pose-btn hair-model ${source.kind === "model" && model.id === source.id ? "active" : ""}" data-mk="model" data-id="${model.id}" aria-pressed="${source.kind === "model" && model.id === source.id}" aria-label="${escapeHtml(model.label)}"><img alt="" loading="lazy" src="${model.src}">${escapeHtml(model.who)}</button>`).join("")}
        </div>
      </div>`).join("")}
    </div>
    <h3>Your photos</h3>
    ${ownPhotos.length ? `<div class="scroller" aria-label="Photos">
      ${ownPhotos.map((item) => `<button type="button" class="pose-btn ${source.kind === "photo" && item.id === source.id ? "active" : ""}" data-mk="photo" data-id="${item.id}"><img alt="" src="${ctx.mediaUrl(`photo:${item.id}:${item.revision || item.createdAt}`, item.blob)}">${escapeHtml(item.name)}</button>`).join("")}
    </div>` : `<p class="hint">A front-facing photo in soft daylight works best. Hair off your face if you can.</p>`}
    <div class="row" style="margin-top:10px">
      <button type="button" class="btn small" data-mk="camera">Take photo</button>
      <button type="button" class="btn ghost small" data-mk="upload">Upload</button>
    </div>
    <input id="mk-file-cam" type="file" accept="image/*" capture="user" hidden>
    <input id="mk-file-lib" type="file" accept="image/*" hidden>
    <button type="button" class="btn full" data-mk="save" style="margin-top:12px">Save ${hair && ms.withHair ? "hair + makeup" : "look"}</button>
    ${ctx.footerHtml()}
  </section>`;
}

/** Mount the tab into `view`. `context` comes from app.js (see makeupContext there). */
export async function mountMakeup(view, context) {
  ctx = context;
  await loadState();
  view.innerHTML = makeupHtml();
  const root = view.querySelector(".mk");
  if (!root) return;
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  const compare = root.querySelector(".mk-compare");
  compare?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    showBefore(true);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) compare?.addEventListener(type, () => showBefore(false));
  for (const selector of [".mk-looks .chip.active", ".mk-models .hair-model.active"]) {
    const chip = root.querySelector(selector);
    const row = chip?.closest(".scroller");
    if (chip && row) row.scrollLeft += chip.getBoundingClientRect().left - row.getBoundingClientRect().left - (row.clientWidth - chip.offsetWidth) / 2;
  }
  await prepareAndPaint();
}

/** Re-render the whole tab (keeps scroll position). */
function rerender() {
  const view = document.getElementById("view");
  if (!view || !view.querySelector(".mk")) return;
  const scroll = window.scrollY;
  const rows = [...view.querySelectorAll(".scroller")].map((row) => row.scrollLeft);
  view.innerHTML = makeupHtml();
  const root = view.querySelector(".mk");
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  const compare = root.querySelector(".mk-compare");
  compare?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    showBefore(true);
  });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) compare?.addEventListener(type, () => showBefore(false));
  [...view.querySelectorAll(".scroller")].forEach((row, index) => {
    if (rows[index] !== undefined) row.scrollLeft = rows[index];
  });
  window.scrollTo(0, scroll);
  prepareAndPaint();
}

function setNote(text) {
  const note = document.getElementById("mk-note");
  if (note) note.textContent = text;
}

function editLayer(layerId, change) {
  const resolved = resolveLook(ms.lookId, ms.custom)[layerId];
  const current = { ...(ms.custom[layerId] || {}) };
  const next = { ...current, ...change };
  if (change.amount === undefined && !(resolved.amount > 0)) next.amount = defaultLayer(layerId).amount;
  ms.custom = { ...ms.custom, [layerId]: next };
  persist();
}

async function onClick(event) {
  const button = event.target.closest("[data-mk]");
  if (!button || button.tagName === "INPUT") return;
  const what = button.dataset.mk;
  const id = button.dataset.id;
  if (what === "audience") {
    ms.audience = id;
    persist();
    rerender();
  } else if (what === "look") {
    ms.lookId = id;
    ms.custom = {};
    persist();
    rerender();
  } else if (what === "layer") {
    ms.layer = id;
    persist();
    rerender();
  } else if (what === "shade") {
    editLayer(ms.layer, { shade: id });
    rerender();
  } else if (what === "crease") {
    editLayer("shadow", { crease: id });
    rerender();
  } else if (what === "style") {
    editLayer(ms.layer, { style: id });
    rerender();
  } else if (what === "off") {
    editLayer(ms.layer, { amount: 0 });
    rerender();
  } else if (what === "reset") {
    ms.custom = {};
    persist();
    rerender();
  } else if (what === "model") {
    ms.source = { kind: "model", id };
    ms.audience = modelAudience({ id });
    if (lookById(ms.lookId).for.length === 1 && !lookById(ms.lookId).for.includes(ms.audience) && !Object.keys(ms.custom).length) {
      ms.lookId = ms.audience === "men" ? "groomed-natural" : "soft-glam";
    }
    persist();
    rerender();
  } else if (what === "photo") {
    ms.source = { kind: "photo", id };
    persist();
    rerender();
  } else if (what === "camera" || what === "upload") {
    document.getElementById(what === "camera" ? "mk-file-cam" : "mk-file-lib")?.click();
  } else if (what === "save") {
    button.disabled = true;
    try {
      await saveLook();
    } catch (error) {
      ctx.showToast(error.message || "Could not save that look.");
    } finally {
      button.disabled = false;
    }
  }
}

function onInput(event) {
  if (event.target.dataset.mk !== "amount") return;
  const value = Number(event.target.value) / 100;
  ms.custom = { ...ms.custom, [ms.layer]: { ...(ms.custom[ms.layer] || {}), amount: value } };
  const label = document.getElementById("mk-amount");
  if (label) label.textContent = String(Math.round(value * 100));
  const name = document.getElementById("mk-name");
  if (name) name.textContent = lookName(ms.lookId, ms.custom);
  persist();
  schedulePaint();
}

async function onChange(event) {
  const target = event.target;
  if (target.dataset.mk === "with-hair") {
    ms.withHair = target.checked;
    persist();
    rerender();
    return;
  }
  if (target.dataset.mk === "amount") {
    rerender();
    return;
  }
  if (target.id === "mk-file-cam" || target.id === "mk-file-lib") {
    const file = target.files?.[0];
    target.value = "";
    if (!file) return;
    try {
      ctx.showToast("Saving your photo on this device…");
      const blob = await downscaleImage(file, 1600, "image/jpeg", 0.86);
      const hasFace = ctx.getPhotos().some((photo) => photo.slot === "face" && !photo.demo);
      const photo = {
        id: uid("photo"),
        slot: hasFace ? "extra" : "face",
        name: hasFace ? "Makeup photo" : "Face",
        demo: false,
        blob,
        createdAt: Date.now(),
        revision: Date.now(),
      };
      await db.putPhoto(photo);
      await ctx.reload();
      ms.source = { kind: "photo", id: photo.id };
      persist();
      ctx.showToast("Photo saved on this device");
      rerender();
    } catch (error) {
      ctx.showToast(error.message || "Could not use that image.");
    }
  }
}

function schedulePaint() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    paintNow();
  });
}

function sourceKey(source, hair) {
  const photo = source.kind === "photo" ? ctx.getPhotos().find((item) => item.id === source.id) : null;
  const base = source.kind === "model" ? `model:${source.id}` : `photo:${source.id}:${photo?.revision || photo?.createdAt}`;
  if (!hair) return base;
  if (hair.kind === "portrait") return `${base}|${hair.src}|${hair.color.id}`;
  const p = hair.placement;
  return `${base}|overlay:${hair.style.id}:${hair.color.id}:${[p.x, p.y, p.scale, p.rotation, p.stretchX, p.stretchY, p.lift, p.crown, p.pushBack, (p.contour || []).length].join(",")}`;
}

async function imageToCanvas(image) {
  const w0 = image.naturalWidth || image.width;
  const h0 = image.naturalHeight || image.height;
  const k = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w0 * k);
  canvas.height = Math.round(h0 * k);
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Load the source (and its hair), find the face, and keep the clean pixels. */
async function prepare(source, hair) {
  const key = sourceKey(source, hair);
  if (cache.has(key)) return cache.get(key);
  let src;
  let objectUrl = "";
  if (source.kind === "model") src = hair?.kind === "portrait" ? hair.src : HAIR_MODELS.find((model) => model.id === source.id).src;
  else {
    const photo = ctx.getPhotos().find((item) => item.id === source.id);
    if (!photo) throw new Error("That photo is gone.");
    objectUrl = URL.createObjectURL(photo.blob);
    src = objectUrl;
  }
  try {
    const image = await loadImage(src);
    const canvas = await imageToCanvas(image);
    const c2d = canvas.getContext("2d", { willReadFrequently: true });
    // Faces are found once per picture (the hair overlay doesn't change the face).
    const faceKey = hair?.kind === "portrait" ? `mk:${hair.src}` : `mk:${key.split("|")[0]}`;
    const face = await detectFace(canvas, faceKey);
    let mask = null;
    try {
      mask = await hairMask(canvas, faceKey);
    } catch {
      mask = null;
    }
    if (hair?.kind === "portrait" && mask) {
      // Same on-device recolor as the Hair tab, so the color matches.
      const pixels = c2d.getImageData(0, 0, canvas.width, canvas.height);
      const scaled = scaleMask(mask, canvas.width, canvas.height);
      recolorHairPixels(pixels.data, scaled, hairColorLut(hair.color));
      c2d.putImageData(pixels, 0, 0);
    }
    let hairArt = null;
    if (hair?.kind === "overlay") hairArt = await tintedHairCanvas(hair.style, hair.color, { pushBack: Boolean(hair.placement.pushBack), contour: Array.isArray(hair.placement.contour) ? hair.placement.contour : null, crown: hair.placement.crown ?? 1 });
    const entry = {
      key,
      width: canvas.width,
      height: canvas.height,
      base: c2d.getImageData(0, 0, canvas.width, canvas.height),
      landmarks: face?.landmarks || null,
      hair: mask,
      hairArt,
      placement: hair?.kind === "overlay" ? hair.placement : null,
    };
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    cache.set(key, entry);
    return entry;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** Hair confidence resampled to the image size (the segmenter may use its own size). */
function scaleMask(mask, width, height) {
  if (mask.width === width && mask.height === height) return mask.data;
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const my = Math.min(mask.height - 1, Math.floor((y / height) * mask.height));
    for (let x = 0; x < width; x += 1) out[y * width + x] = mask.data[my * mask.width + Math.min(mask.width - 1, Math.floor((x / width) * mask.width))];
  }
  return out;
}

async function prepareAndPaint() {
  const mine = ++token;
  const source = currentSource();
  const hair = ms.withHair ? hairFor(source) : null;
  const key = sourceKey(source, hair);
  if (prepared?.key === key) {
    paintNow();
    return;
  }
  setNote("Finding the face…");
  try {
    const entry = await prepare(source, hair);
    if (mine !== token) return;
    prepared = entry;
    setNote(entry.landmarks ? lookById(ms.lookId).blurb : "Couldn't find a face here. Try a front-facing photo in good light.");
    paintNow();
  } catch (error) {
    if (mine !== token) return;
    setNote("Makeup preview isn't available here.");
    ctx.showToast(error.message || "Could not load that photo.");
  }
}

let before = false;
function showBefore(on) {
  before = on;
  paintNow();
}

/** Paint the look on a copy of the clean pixels, then add the overlay hair. */
function renderOut(entry, withMakeup = true) {
  const pixels = new ImageData(new Uint8ClampedArray(entry.base.data), entry.width, entry.height);
  if (withMakeup && entry.landmarks) paintMakeup(pixels, entry.landmarks, resolveLook(ms.lookId, ms.custom), { hair: entry.hair });
  const canvas = document.createElement("canvas");
  canvas.width = entry.width;
  canvas.height = entry.height;
  canvas.getContext("2d").putImageData(pixels, 0, 0);
  if (!entry.hairArt) return canvas;
  // Same framing as the Hair tab stage (3:4), so the fitted hair lands in the same place.
  const W = 960;
  const H = 1280;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const c = out.getContext("2d");
  c.imageSmoothingQuality = "high";
  c.fillStyle = "#f4e7dc";
  c.fillRect(0, 0, W, H);
  const fitted = containRect(W, H, entry.width, entry.height);
  c.drawImage(canvas, fitted.x, fitted.y, fitted.w, fitted.h);
  const f = hairFrame(W, H, entry.placement);
  c.save();
  c.translate(f.cx, f.cy);
  c.rotate((f.rotation * Math.PI) / 180);
  c.drawImage(entry.hairArt, -f.anchorX * f.w, -f.anchorY * f.h, f.w, f.h);
  c.restore();
  return out;
}

function paintNow() {
  const target = document.getElementById("mk-canvas");
  if (!target || !prepared) return;
  const out = renderOut(prepared, !before);
  if (target.width !== out.width || target.height !== out.height) {
    target.width = out.width;
    target.height = out.height;
  }
  target.getContext("2d").drawImage(out, 0, 0);
}

async function saveLook() {
  const source = currentSource();
  const hair = ms.withHair ? hairFor(source) : null;
  const entry = await prepare(source, hair);
  if (!entry.landmarks) throw new Error("Couldn't find a face, so there's no makeup to save.");
  const canvas = renderOut(entry, true);
  const previewBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!previewBlob) throw new Error("Could not save that look.");
  const name = lookName(ms.lookId, ms.custom);
  const profile = ctx.getProfile();
  const hairState = ctx.getHair();
  const look = {
    id: uid("look"),
    name: hair ? `${name} · ${hair.style.label}` : name,
    occasion: "everyday",
    photoId: source.kind === "photo" ? source.id : null,
    makeupId: "none",
    strength: 0.85,
    layers: [],
    placementVersion: PLACEMENT_VERSION,
    sharing: isTeen(profile) ? { mode: "private", audience: "approved-friends" } : { mode: "private" },
    previewBlob,
    makeup: { lookId: ms.lookId, custom: JSON.parse(JSON.stringify(ms.custom)), source, withHair: Boolean(hair) },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (hair && hairState) look.hairWith = { styleId: hair.style.id, colorId: hair.color.id, modelId: hairState.modelId || null };
  await db.putLook(look);
  await ctx.reload();
  ctx.showToast(isTeen(profile) ? "Saved on this device. Find it in Looks." : "Saved on this device. It's in Looks, ready to share.");
}

/** Open a saved makeup look again (from the Looks tab). */
export async function openMakeupLook(look) {
  await loadState();
  if (!look?.makeup) return;
  ms.lookId = look.makeup.lookId || "none";
  ms.custom = look.makeup.custom && typeof look.makeup.custom === "object" ? look.makeup.custom : {};
  if (look.makeup.source) ms.source = look.makeup.source;
  ms.withHair = look.makeup.withHair !== false;
  persist();
}
