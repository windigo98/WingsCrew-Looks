import { CATEGORIES, DEMO_ART_VERSION, DEMO_POSES, OCCASIONS, PHOTO_SLOTS, SAMPLES, categoryLabel, occasionLabel, sampleById, sortPhotos } from "./catalog.js";
import { db } from "./db.js";
import { downscaleImage, loadImage } from "./images.js";
import { buildStamps, hasFaceAnchor } from "./makeup.js";
import { PLACEMENT_VERSION, applyWear, needsReseat, normalizeLayers, scaleCap } from "./placement.js";
import { providers } from "./providers.js";
import { clamp, escapeHtml, mapsSearchUrl, safeHttpUrl, uid } from "./util.js";
import { buildWishlistRecord, firstChoice, wishlistToForm } from "./wishlist-model.js";

const NAV = [
  ["dress", "Dress", icon("dress")],
  ["photos", "Photos", icon("photos")],
  ["closet", "Closet", icon("closet")],
  ["wishlist", "Wishlist", icon("wish")],
  ["looks", "Looks", icon("looks")],
];

const FILTERS = [
  ["all", "All"],
  ["top", "Tops"],
  ["bottom", "Bottoms"],
  ["dress", "Dresses"],
  ["outerwear", "Layers"],
  ["shoes", "Shoes"],
  ["extra", "Extras"],
];

const state = {
  ready: false,
  error: "",
  profile: null,
  onboardStep: 0,
  ageChecked: false,
  photos: [],
  items: [],
  looks: [],
  wishes: [],
  votes: [],
  dismissedRibbon: false,
  lookFilter: "all",
  sampleFilter: "all",
  compare: false,
  studio: emptyStudio(),
  layout: null,
};

const visuals = new Map();
const mediaUrls = new Map();
let draftTimer = 0;
let toastTimer = 0;
let pendingItem = null;
let pendingCategory = "top";
let addFrom = "studio";
let wishSource = null;
let pick = null;
const pointers = new Map();
let gesture = null;

function emptyStudio() {
  return {
    photoId: null,
    makeupId: "none",
    strength: 0.85,
    layers: [],
    selectedId: null,
    occasion: "everyday",
    lookId: null,
    dirty: false,
    placementVersion: PLACEMENT_VERSION,
  };
}

function wingSvg(className = "wing") {
  return `<svg class="${className}" viewBox="0 0 80 48" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M38 36c-6-2-16-8-22-18 6 1 14 4 20 10"/><path d="M38 36c-4-6-10-16-12-24 6 3 12 8 14 16"/><path d="M42 36c6-2 16-8 22-18-6 1-14 4-20 10"/><path d="M42 36c4-6 10-16 12-24-6 3-12 8-14 16"/></g></svg>`;
}

function icon(name) {
  const common = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const paths = {
    dress: `<path d="M9 3l3 3 3-3 3 5-3 2v11H9V10L6 8z"/>`,
    photos: `<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="12" cy="12" r="3"/>`,
    closet: `<path d="M4 8h16v12H4z"/><path d="M8 8V5h8v3M12 8v12"/>`,
    wish: `<path d="M7 3h10v18l-5-3-5 3z"/>`,
    looks: `<rect x="7" y="7" width="12" height="14" rx="2"/><path d="M9 7V4h9v5"/>`,
  };
  return `<svg ${common}>${paths[name]}</svg>`;
}

function footerHtml() {
  return `<footer class="legal">© 2026 WingsCrew. All rights reserved.</footer>`;
}

function parseRoute() {
  const raw = (location.hash || "#dress").replace(/^#\/?/, "");
  const [path, id] = raw.split("/");
  if (!["dress", "photos", "closet", "wishlist", "looks", "vote"].includes(path)) return { path: "dress", id: "" };
  return { path, id: id || "" };
}

function go(path) {
  const next = `#${path}`;
  if (location.hash === next) render();
  else location.hash = next;
}

function currentPhoto() {
  return state.photos.find((photo) => photo.id === state.studio.photoId) || null;
}

function selectedLayer() {
  return state.studio.layers.find((layer) => layer.id === state.studio.selectedId) || null;
}

function mediaUrl(key, blob) {
  if (!blob) return "";
  if (mediaUrls.has(key)) return mediaUrls.get(key);
  const url = URL.createObjectURL(blob);
  mediaUrls.set(key, url);
  return url;
}

function hideToast() {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.classList.remove("show");
  toast.hidden = true;
}

function showToast(message, { undo } = {}) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.hidden = false;
  toast.classList.add("show");
  toast.innerHTML = `<span>${escapeHtml(message)}</span>${undo ? `<button type="button" data-undo>Undo</button>` : ""}`;
  clearTimeout(toastTimer);
  const undoFn = undo;
  toast.querySelector("[data-undo]")?.addEventListener("click", async () => {
    clearTimeout(toastTimer);
    hideToast();
    try {
      await undoFn();
      await reload();
      render();
    } catch (error) {
      showToast(error.message || "Could not undo that.");
    }
  });
  toastTimer = setTimeout(hideToast, undo ? 4200 : 2200);
}

function askConfirm({ title, body, confirmLabel, danger }) {
  const root = document.getElementById("confirm-root");
  root.hidden = false;
  root.innerHTML = `
    <div class="sheet-backdrop" data-no></div>
    <div class="confirm-card" role="dialog" aria-modal="true">
      <h2>${escapeHtml(title)}</h2>
      <p class="lede">${escapeHtml(body)}</p>
      <div class="row">
        <button type="button" class="btn ghost" data-no>Cancel</button>
        <button type="button" class="btn ${danger ? "rose" : ""}" data-yes>${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;
  return new Promise((resolve) => {
    const finish = (value) => {
      root.hidden = true;
      root.innerHTML = "";
      resolve(value);
    };
    root.querySelector("[data-yes]").onclick = () => finish(true);
    root.querySelectorAll("[data-no]").forEach((node) => { node.onclick = () => finish(false); });
  });
}

function openSheet(html) {
  const root = document.getElementById("sheet-root");
  root.hidden = false;
  root.innerHTML = `<div class="sheet-backdrop" data-sheet-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  return root;
}

function closeSheet() {
  const root = document.getElementById("sheet-root");
  root.hidden = true;
  root.innerHTML = "";
  if (pendingItem?.url) URL.revokeObjectURL(pendingItem.url);
  pendingItem = null;
}

function saveDraft() {
  const studio = state.studio;
  db.setMeta("draft", {
    photoId: studio.photoId,
    makeupId: studio.makeupId,
    strength: studio.strength,
    layers: studio.layers.map(stripLayer),
    selectedId: null,
    occasion: studio.occasion,
    lookId: studio.lookId,
    dirty: studio.dirty,
    placementVersion: PLACEMENT_VERSION,
  }).catch(() => {});
}

function markDirty() {
  state.studio.dirty = true;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 350);
}

function stripLayer(layer) {
  const { image, aspect, ...rest } = layer;
  return rest;
}

async function reload() {
  const [photos, items, looks, wishes, votes] = await Promise.all([
    db.getAllPhotos(),
    db.getAllItems(),
    db.getAllLooks(),
    db.getAllWishes(),
    db.getAllVotes(),
  ]);
  state.photos = sortPhotos(photos);
  state.items = items.sort((a, b) => b.createdAt - a.createdAt);
  state.looks = looks.sort((a, b) => b.updatedAt - a.updatedAt);
  state.wishes = wishes.sort((a, b) => b.updatedAt - a.updatedAt);
  state.votes = votes;
}

function renderShell() {
  document.getElementById("app").innerHTML = `
    <div class="shell">
      <header class="header" id="header">
        <div class="brand">${wingSvg("brand-mark")}<h1>WingsCrew Looks</h1></div>
        <button type="button" class="icon-btn" data-action="about" aria-label="About and privacy">i</button>
      </header>
      <main id="view"></main>
      <nav class="nav" id="nav">${NAV.map(([path, label, svg]) => `<button type="button" data-action="go" data-route="${path}">${svg}<span>${label}</span></button>`).join("")}</nav>
      <div id="toast" class="toast" hidden role="status"></div>
    </div>
    <div id="sheet-root" class="sheet-root" hidden></div>
    <div id="confirm-root" class="confirm-root" hidden></div>
    <input id="file-cam" type="file" accept="image/*" capture="environment" hidden>
    <input id="file-lib" type="file" accept="image/*" hidden>`;
  document.getElementById("file-cam").addEventListener("change", onPickedFile);
  document.getElementById("file-lib").addEventListener("change", onPickedFile);
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("input", onInput);
  document.body.addEventListener("change", onChange);
  document.body.addEventListener("pointerdown", onCompareDown);
  window.addEventListener("pointerup", onCompareUp);
  window.addEventListener("pointercancel", onCompareUp);
  window.addEventListener("hashchange", render);
  window.addEventListener("resize", () => { if (parseRoute().path === "dress") paintStudio(); });
  window.addEventListener("keydown", onKey);
}

async function init() {
  renderShell();
  document.getElementById("view").innerHTML = `<p class="lede">Opening your looks…</p>`;
  try {
    state.profile = await db.getMeta("profile");
    state.dismissedRibbon = Boolean(await db.getMeta("ribbon"));
    await reload();
    await refreshDemoArt();
    const draft = await db.getMeta("draft");
    if (draft?.layers) {
      const version = Object.prototype.hasOwnProperty.call(draft, "placementVersion") ? draft.placementVersion : 0;
      state.studio = { ...emptyStudio(), ...draft, layers: draft.layers || [], placementVersion: version };
    }
    if (!state.photos.some((photo) => photo.id === state.studio.photoId)) {
      state.studio.photoId = state.photos.find((photo) => !photo.demo)?.id || state.photos[0]?.id || null;
    }
    if (needsReseat(state.studio)) {
      state.studio = reseatStudio(state.studio);
      saveDraft();
    }
  } catch (error) {
    state.error = error?.message || "This browser blocked on-device storage.";
  }
  state.ready = true;
  render();
}

function reseatStudio(studio) {
  const photo = state.photos.find((item) => item.id === studio.photoId);
  const slot = photo?.slot || "front";
  const items = normalizeLayers(studio.layers, slot);
  const stamps = studio.makeupId && studio.makeupId !== "none" ? buildStamps(studio.makeupId, slot) : [];
  const layers = [...items, ...stamps];
  const selectedId = layers.some((layer) => layer.id === studio.selectedId) ? studio.selectedId : null;
  return { ...studio, layers, selectedId, placementVersion: PLACEMENT_VERSION };
}

function render() {
  if (!state.ready) return;
  document.body.classList.toggle("in-studio", parseRoute().path === "dress");
  pointers.clear();
  gesture = null;
  const header = document.getElementById("header");
  const nav = document.getElementById("nav");
  const view = document.getElementById("view");
  const onboarded = Boolean(state.profile?.onboarded) && !state.error;
  header.hidden = !onboarded;
  nav.hidden = !onboarded;
  document.body.classList.toggle("onboarding", !onboarded);
  if (state.error) {
    view.innerHTML = `<section class="empty"><h2>Can't store photos here</h2><p class="lede">${escapeHtml(state.error)} Try a regular Safari or Chrome tab.</p>${footerHtml()}</section>`;
    return;
  }
  if (!onboarded) {
    view.innerHTML = onboardHtml();
    return;
  }
  const route = parseRoute();
  document.body.dataset.route = route.path;
  nav.querySelectorAll("button").forEach((button) => {
    const on = button.dataset.route === route.path || (route.path === "vote" && button.dataset.route === "looks");
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (route.path === "photos") view.innerHTML = photosHtml();
  else if (route.path === "closet") view.innerHTML = closetHtml();
  else if (route.path === "wishlist") view.innerHTML = wishlistHtml();
  else if (route.path === "looks") view.innerHTML = looksHtml();
  else if (route.path === "vote") view.innerHTML = voteHtml(route.id);
  else {
    view.innerHTML = studioHtml();
    bindStage();
    ensureVisuals().then(() => paintStudio()).catch((error) => showToast(error.message || "Could not draw that look."));
  }
}

function onboardHtml() {
  const step = state.onboardStep;
  const dots = [0, 1, 2].map((index) => `<i class="${index <= step ? "on" : ""}"></i>`).join("");
  if (step === 0) {
    return `<section class="onboard">
      <div>${wingSvg()}<p class="steps" aria-hidden="true">${dots}</p>
        <h1>WingsCrew Looks</h1>
        <p class="lede">Try clothes, jewelry, and makeup on a photo of you. Save the ones you love.</p>
        <p class="tagline">Then ask a friend: Fit or Miss?</p>
      </div>
      <button type="button" class="btn full" data-action="onboard-next">Continue</button>
      ${footerHtml()}
    </section>`;
  }
  if (step === 1) {
    return `<section class="onboard">
      <div><p class="steps" aria-hidden="true">${dots}</p>
        <h1>Adults only</h1>
        <p class="lede">WingsCrew Looks is for people 18 and older. Photos of a face and body need an adult's yes.</p>
        <label class="check"><input id="age-check" type="checkbox" ${state.ageChecked ? "checked" : ""}> I confirm I am 18 or older</label>
      </div>
      <div class="stack">
        <button type="button" class="btn full" data-action="onboard-next" ${state.ageChecked ? "" : "disabled"}>Continue</button>
        <button type="button" class="btn ghost full" data-action="onboard-back">Back</button>
      </div>
      ${footerHtml()}
    </section>`;
  }
  return `<section class="onboard">
    <div><p class="steps" aria-hidden="true">${dots}</p>
      <h1>Your photos stay here</h1>
      <ul class="bullets">
        <li>In this prototype, photos are stored only on this device, in this browser.</li>
        <li>They are not uploaded to WingsCrew or anyone else.</li>
        <li>Delete them anytime with one tap on the Photos page.</li>
        <li>A look is a preview, not a real fitting.</li>
      </ul>
    </div>
    <div class="stack">
      <button type="button" class="btn full" data-action="onboard-finish">Keep photos on this device</button>
      <button type="button" class="btn ghost full" data-action="onboard-back">Back</button>
    </div>
    ${footerHtml()}
  </section>`;
}

async function finishOnboarding() {
  if (!state.ageChecked) return;
  const now = Date.now();
  state.profile = { onboarded: true, ageConfirmedAt: now, photoNoticeAt: now };
  await db.setMeta("profile", state.profile);
  go("photos");
}

function photosHtml() {
  const slots = PHOTO_SLOTS.map((slot) => photoSlotCard(slot)).join("");
  const extras = state.photos.filter((photo) => photo.slot === "extra").map((photo) => extraCard(photo)).join("");
  const demos = state.photos.filter((photo) => photo.demo);
  return `<section>
    <div class="section-head"><div><h2>Photos</h2><p class="lede">Each photo is a pose you can dress. Front, side, and face cover the basics.</p></div></div>
    ${slots}
    ${extras}
    <button type="button" class="btn ghost full" data-action="add-extra">Add another pose</button>
    <div class="card" style="margin-top:16px">
      <h3>Demo drawings</h3>
      <p class="hint">No photo handy? These are illustrations, not you. Your real photos still stay on this device.</p>
      ${demos.length ? `<div class="card-grid">${demos.map((photo) => demoCard(photo)).join("")}</div>` : ""}
      ${demos.length < DEMO_POSES.length ? `<button type="button" class="btn small" data-action="add-demo" style="margin-top:10px">${demos.length ? "Add the rest" : "Try demo drawings"}</button>` : ""}
    </div>
    <button type="button" class="btn ghost full" data-action="delete-photos" style="margin-top:16px" ${state.photos.some((photo) => !photo.demo) ? "" : "disabled"}>Delete my photos</button>
    ${footerHtml()}
  </section>`;
}

function photoSlotCard(slot) {
  const photo = state.photos.find((item) => item.slot === slot.slot && !item.demo);
  return `<article class="card">
    <div class="thumb-row">
      ${photo ? `<img class="thumb" alt="" src="${mediaUrl(`photo:${photo.id}:${photo.revision || photo.createdAt}`, photo.blob)}">` : `<div class="ph"></div>`}
      <div>
        <h3>${escapeHtml(slot.name)}</h3>
        <p class="hint">${escapeHtml(slot.guidance)}</p>
      </div>
    </div>
    <div class="card-actions">
      ${photo ? `
        <button type="button" class="btn small" data-action="use-pose" data-id="${photo.id}">Use this pose</button>
        <button type="button" class="btn ghost small" data-action="pick-photo" data-slot="${slot.slot}" data-camera="1" data-replace="${photo.id}">Camera</button>
        <button type="button" class="btn ghost small" data-action="pick-photo" data-slot="${slot.slot}" data-replace="${photo.id}">Upload</button>
        <button type="button" class="btn ghost small" data-action="delete-photo" data-id="${photo.id}">Delete</button>` : `
        <button type="button" class="btn small" data-action="pick-photo" data-slot="${slot.slot}" data-camera="1" data-facing="${slot.facing}">Camera</button>
        <button type="button" class="btn ghost small" data-action="pick-photo" data-slot="${slot.slot}" data-facing="${slot.facing}">Upload</button>`}
    </div>
  </article>`;
}

function extraCard(photo) {
  return `<article class="card">
    <div class="thumb-row">
      <img class="thumb" alt="" src="${mediaUrl(`photo:${photo.id}:${photo.revision || photo.createdAt}`, photo.blob)}">
      <label class="field">Pose name
        <input data-action="rename-photo" data-id="${photo.id}" maxlength="40" value="${escapeHtml(photo.name)}">
      </label>
    </div>
    <div class="card-actions">
      <button type="button" class="btn small" data-action="use-pose" data-id="${photo.id}">Use this pose</button>
      <button type="button" class="btn ghost small" data-action="delete-photo" data-id="${photo.id}">Delete</button>
    </div>
  </article>`;
}

function demoCard(photo) {
  return `<article class="closet-card">
    <img alt="" src="${mediaUrl(`photo:${photo.id}:${photo.revision || photo.createdAt}`, photo.blob)}">
    <strong>${escapeHtml(photo.name)}</strong>
    <div class="card-actions">
      <button type="button" class="btn small" data-action="use-pose" data-id="${photo.id}">Use</button>
      <button type="button" class="btn ghost small" data-action="delete-photo" data-id="${photo.id}">Delete</button>
    </div>
  </article>`;
}

function studioHtml() {
  const photo = currentPhoto();
  const presets = providers.makeup.presets;
  return `<section class="studio">
    ${ribbonHtml()}
    <div class="stage-column">
      <div class="stage-wrap">
        <canvas id="stage" aria-label="Look preview"></canvas>
        <div class="ai-badge">${wingSvg()}<span><small>AI preview</small><strong>WingsCrew Looks</strong></span></div>
        <div class="stage-empty" ${photo ? "hidden" : ""}>
          <p>Add a photo of you, or try a demo drawing.</p>
          <div class="row">
            <button type="button" class="btn small" data-action="go" data-route="photos">Add a photo</button>
            <button type="button" class="btn ghost small" data-action="add-demo">Try demo drawings</button>
          </div>
        </div>
      </div>
      <p class="hint">Preview, not a fitting. Drag a piece to move it. Pinch to resize, twist two fingers to turn it.</p>
    </div>
    <div class="pose-row scroller" aria-label="Poses">
      ${state.photos.map((item) => `<button type="button" class="pose-btn ${item.id === state.studio.photoId ? "active" : ""}" data-action="use-pose" data-id="${item.id}"><img alt="" src="${mediaUrl(`photo:${item.id}:${item.revision || item.createdAt}`, item.blob)}">${escapeHtml(item.name)}</button>`).join("") || `<span class="hint">No poses yet.</span>`}
    </div>
    <div class="tools-column">
      <div class="panel">
        <h3>Makeup</h3>
        <div class="scroller">
          ${presets.map((preset) => `<button type="button" class="makeup-btn ${preset.id === state.studio.makeupId ? "active" : ""}" data-action="makeup" data-id="${preset.id}"><i class="swatch" style="background:${preset.swatch}"></i>${escapeHtml(preset.name)}</button>`).join("")}
        </div>
        ${makeupControlsHtml()}
      </div>
      <div class="panel" id="layer-controls">${controlsHtml()}</div>
      <div class="panel">
        <div class="panel-head">
          <h3>Pieces</h3>
          <button type="button" class="btn ghost small" data-action="clear-outfit" ${state.studio.layers.some((layer) => layer.kind !== "stamp") ? "" : "disabled"}>Clear outfit</button>
        </div>
        <p class="hint">One piece per spot. A dress replaces the top and bottom. A layer can sit over a top. Tap a piece again to select it.</p>
        <div class="scroller">
          <button type="button" class="chip ${state.sampleFilter === "samples-tab" ? "" : ""}" data-action="open-add">Add</button>
          ${FILTERS.map(([id, label]) => `<button type="button" class="chip ${state.sampleFilter === id ? "active" : ""}" data-action="filter" data-filter="${id}">${label}</button>`).join("")}
          <button type="button" class="chip ${state.sampleFilter === "closet" ? "active" : ""}" data-action="tray-closet">My Closet</button>
        </div>
        <div class="sample-grid" style="margin-top:10px">${trayHtml()}</div>
      </div>
    </div>
    <div class="studio-actions row">
      <button type="button" class="btn" data-action="save-look">Save look</button>
      <button type="button" class="btn rose" data-action="ask-vote">Fit or Miss?</button>
      <button type="button" class="btn ghost" data-action="share-studio">Share image</button>
    </div>
    ${footerHtml()}
  </section>`;
}

function makeupControlsHtml() {
  const anchored = hasFaceAnchor(currentPhoto()?.slot);
  if (state.studio.makeupId === "none") {
    return `<p class="hint">Presets are a stand-in for AI makeup. Color stays on the face.</p>`;
  }
  if (!anchored) {
    return `<p class="hint">This pose has no face anchor, so makeup stays off. Switch to Front, Side, or Face.</p>`;
  }
  return `<label>Strength <b>${Math.round(state.studio.strength * 100)}%</b><input type="range" min="0.15" max="1" step="0.01" value="${state.studio.strength}" data-action="strength"></label><button type="button" class="btn ghost small" data-action="compare">Hold to compare</button><p class="hint">Color stays on the face. Drag a stamp if it misses.</p>`;
}

function ribbonHtml() {
  if (state.dismissedRibbon || state.looks.length) return "";
  const photo = state.photos.some((item) => !item.demo) || state.photos.length > 0;
  const piece = state.studio.layers.some((layer) => layer.kind !== "stamp");
  const makeup = state.studio.makeupId !== "none";
  const steps = [
    [photo, "1 · Photo"],
    [piece, "2 · Dress"],
    [makeup, "3 · Makeup"],
    [false, "4 · Save"],
  ];
  return `<div class="ribbon">${steps.map(([done, label]) => `<span class="${done ? "done" : ""}">${label}</span>`).join("")}<button type="button" class="btn ghost small" data-action="dismiss-ribbon">Hide</button></div>`;
}

function controlsHtml() {
  const sorted = [...state.studio.layers].sort((a, b) => (a.z || 0) - (b.z || 0));
  const list = sorted.length
    ? `<div class="scroller">${sorted.map((layer) => `<button type="button" class="chip ${layer.id === state.studio.selectedId ? "active" : ""}" data-action="select-layer" data-id="${layer.id}">${escapeHtml(layer.name || "Piece")}</button>`).join("")}</div>`
    : "";
  const layer = selectedLayer();
  if (!layer) return `${list}<p class="hint">Tap a piece on the photo, or add one below. Sliders are here if pinch is fiddly.</p>`;
  const stamp = layer.kind === "stamp";
  const limits = scaleLimits(layer);
  return `${list}
    <p><strong>${escapeHtml(layer.name || "Piece")}</strong></p>
    <label>Size <b>${Math.round(layer.scale * 100)}</b>
      <input type="range" min="${limits.min}" max="${limits.max}" step="0.005" value="${layer.scale}" data-action="scale">
    </label>
    <label>Rotate <b>${Math.round(layer.rotation || 0)}°</b>
      <input type="range" min="-180" max="180" step="1" value="${layer.rotation || 0}" data-action="rotate">
    </label>
    <div class="row">
      <button type="button" class="btn ghost small" data-action="flip">Flip</button>
      <button type="button" class="btn ghost small" data-action="layer-back">Back</button>
      <button type="button" class="btn ghost small" data-action="layer-forward">Forward</button>
      <button type="button" class="btn ghost small" data-action="delete-layer">Delete</button>
      ${stamp ? "" : `<button type="button" class="btn ghost small" data-action="closet-layer">Closet</button><button type="button" class="btn ghost small" data-action="wish-layer">Wishlist</button>`}
    </div>`;
}

function trayHtml() {
  if (state.sampleFilter === "closet") {
    const owned = state.items.filter((item) => item.owned);
    if (!owned.length) return `<p class="hint">Nothing in My Closet yet. Add a piece and mark that you own it.</p>`;
    return owned.map((item) => `<button type="button" class="sample-card" data-action="wear" data-id="${item.id}"><img alt="" src="${mediaUrl(`item:${item.id}:${item.revision || item.createdAt}`, item.blob)}"><strong>${escapeHtml(item.name)}</strong></button>`).join("");
  }
  const samples = SAMPLES.filter((sample) => {
    if (state.sampleFilter === "all") return true;
    if (state.sampleFilter === "extra") return ["hat", "bag", "jewelry", "accessory"].includes(sample.category);
    return sample.category === state.sampleFilter;
  });
  return samples.map((sample) => `<button type="button" class="sample-card" data-action="add-sample" data-id="${sample.id}"><img alt="" src="${sample.src}"><strong>${escapeHtml(sample.name)}</strong></button>`).join("");
}

function closetHtml() {
  const owned = state.items.filter((item) => item.owned);
  return `<section>
    <div class="section-head"><div><h2>My Closet</h2><p class="lede">Pieces you already own. Wear them again on any pose.</p></div>
      <button type="button" class="btn small" data-action="open-add" data-from="closet">Add</button>
    </div>
    ${owned.length ? `<div class="card-grid">${owned.map((item) => `<article class="closet-card">
      <img alt="" src="${mediaUrl(`item:${item.id}:${item.revision || item.createdAt}`, item.blob)}">
      <strong>${escapeHtml(item.name)}</strong>
      <div class="meta-line"><span class="tag everyday">${escapeHtml(categoryLabel(item.category))}</span></div>
      <div class="card-actions">
        <button type="button" class="btn small" data-action="wear" data-id="${item.id}">Wear</button>
        <button type="button" class="btn ghost small" data-action="wish-item" data-id="${item.id}">Wishlist</button>
        <button type="button" class="btn ghost small" data-action="delete-item" data-id="${item.id}">Delete</button>
      </div>
    </article>`).join("")}</div>` : `<div class="empty"><h2>Closet's open</h2><p class="lede">Photograph a piece on a hanger or a plain background, then wear it on your photo.</p></div>`}
    ${footerHtml()}
  </section>`;
}

function wishlistHtml() {
  return `<section>
    <div class="section-head"><div><h2>Wishlist</h2><p class="lede">Private on this device. Size, color, and where to buy are ready for a shared registry later.</p></div>
      <button type="button" class="btn small" data-action="new-wish">Add</button>
    </div>
    ${state.wishes.length ? state.wishes.map(wishCard).join("") : `<div class="empty"><h2>Nothing saved yet</h2><p class="lede">When a look has a piece you want, add it here with your size and the store.</p><button type="button" class="btn" data-action="new-wish">Add a wish</button></div>`}
    ${footerHtml()}
  </section>`;
}

function wishCard(record) {
  const first = firstChoice(record);
  const alts = (record.variants || []).filter((variant) => variant.role === "alternate");
  const altText = alts.map((variant) => {
    if (variant.size && variant.size !== first?.size) return variant.size;
    return variant.color;
  }).filter(Boolean).join(", ");
  const online = record.places?.find((place) => place.kind === "online");
  const nearby = record.places?.find((place) => place.kind === "nearby");
  const mapsUrl = nearby?.mapsUrl || (nearby?.address ? mapsSearchUrl(nearby.address) : "");
  const choice = [first?.size, first?.color].filter(Boolean).join(" · ");
  return `<article class="card">
    <div class="section-head"><h3>${escapeHtml(record.name)}</h3>${record.priceDisplay ? `<strong>${escapeHtml(record.priceDisplay)}</strong>` : ""}</div>
    <div class="meta-line"><span class="tag everyday">${escapeHtml(categoryLabel(record.category))}</span>${record.store ? `<span class="hint">${escapeHtml(record.store)}</span>` : ""}</div>
    ${choice ? `<p>First choice: ${escapeHtml(choice)}</p>` : ""}
    ${altText ? `<p class="hint">Also OK: ${escapeHtml(altText)}</p>` : ""}
    ${record.fitNotes ? `<p class="hint">${escapeHtml(record.fitNotes)}</p>` : ""}
    ${nearby?.address ? `<p>${escapeHtml([nearby.store, nearby.address].filter(Boolean).join(" · "))}</p>` : ""}
    ${mapsUrl ? `<a class="btn small" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Open in Maps</a>` : ""}
    ${record.jewelry ? `<p class="hint">${escapeHtml([record.jewelry.metal, record.jewelry.finishStone, record.jewelry.sizeOrLength].filter(Boolean).join(" · "))}</p>` : ""}
    <div class="card-actions">
      ${online?.url ? `<a class="btn ghost small" href="${escapeHtml(online.url)}" target="_blank" rel="noopener noreferrer">View item</a>` : ""}
      <button type="button" class="btn ghost small" data-action="edit-wish" data-id="${record.id}">Edit</button>
      <button type="button" class="btn ghost small" data-action="delete-wish" data-id="${record.id}">Delete</button>
    </div>
    ${nearby?.note ? `<p class="hint">${escapeHtml(nearby.store || "Nearby")} — ${escapeHtml(nearby.note)}</p>` : ""}
  </article>`;
}

function looksHtml() {
  const filters = [{ id: "all", label: "All" }, ...OCCASIONS];
  const looks = state.looks.filter((look) => state.lookFilter === "all" || look.occasion === state.lookFilter);
  return `<section>
    <div class="section-head"><div><h2>Looks</h2><p class="lede">Saved on this device, with the occasion you picked.</p></div></div>
    <div class="scroller" style="margin-bottom:12px">${filters.map((filter) => `<button type="button" class="chip ${state.lookFilter === filter.id ? "active" : ""}" data-action="look-filter" data-filter="${filter.id}">${escapeHtml(filter.label)}</button>`).join("")}</div>
    ${looks.length ? `<div class="card-grid">${looks.map(lookCard).join("")}</div>` : `<div class="empty"><h2>No looks yet</h2><p class="lede">Dress a photo, then save it with a name.</p><button type="button" class="btn" data-action="go" data-route="dress">Start a look</button></div>`}
    ${footerHtml()}
  </section>`;
}

function lookCard(look) {
  const tally = voteTally(look.id);
  const src = look.previewBlob ? mediaUrl(`preview:${look.id}:${look.updatedAt}`, look.previewBlob) : "";
  return `<article class="look-card">
    ${src ? `<img alt="${escapeHtml(look.name)}" src="${src}">` : `<div class="ph"></div>`}
    <strong>${escapeHtml(look.name)}</strong>
    <div class="meta-line"><span class="tag ${escapeHtml(look.occasion)}">${escapeHtml(occasionLabel(look.occasion))}</span></div>
    <p class="hint">${tally.heart} heart · ${tally.meh} meh · ${tally.no} no</p>
    <div class="card-actions">
      <button type="button" class="btn small" data-action="open-look" data-id="${look.id}">Open</button>
      <button type="button" class="btn ghost small" data-action="go" data-route="vote/${look.id}">Vote</button>
      <button type="button" class="btn ghost small" data-action="share-look" data-id="${look.id}">Share</button>
      <button type="button" class="btn ghost small" data-action="delete-look" data-id="${look.id}">Delete</button>
    </div>
  </article>`;
}

function voteHtml(id) {
  const look = state.looks.find((item) => item.id === id);
  if (!look) return `<section class="empty"><h2>That look isn't here</h2><button type="button" class="btn" data-action="go" data-route="looks">Back to looks</button></section>`;
  const tally = voteTally(id);
  const mine = state.votes.find((vote) => vote.id === `device-${id}`);
  const src = look.previewBlob ? mediaUrl(`preview:${look.id}:${look.updatedAt}`, look.previewBlob) : "";
  const button = (reaction, label, glyph) => `<button type="button" class="vote-btn ${mine?.reaction === reaction ? "on" : ""}" data-action="vote" data-id="${look.id}" data-reaction="${reaction}"><b>${glyph}</b>${label}<small>${tally[reaction]}</small></button>`;
  return `<section class="vote">
    <button type="button" class="btn ghost small" data-action="go" data-route="looks">Back</button>
    ${src ? `<img alt="${escapeHtml(look.name)}" src="${src}">` : ""}
    <p class="tag ${escapeHtml(look.occasion)}">${escapeHtml(occasionLabel(look.occasion))}</p>
    <h2>Fit or Miss?</h2>
    <p class="lede">${escapeHtml(look.name)}</p>
    <div class="vote-buttons">
      ${button("heart", "Heart", "♥")}
      ${button("meh", "Meh", "–")}
      ${button("no", "No", "×")}
    </div>
    <p class="hint">Your vote stays on this device. In-app invites and live votes from friends need a backend in the next phase.</p>
    <button type="button" class="btn full" data-action="share-look" data-id="${look.id}">Share image</button>
    ${footerHtml()}
  </section>`;
}

function voteTally(lookId) {
  const rows = state.votes.filter((vote) => vote.lookId === lookId);
  return {
    heart: rows.filter((vote) => vote.reaction === "heart").length,
    meh: rows.filter((vote) => vote.reaction === "meh").length,
    no: rows.filter((vote) => vote.reaction === "no").length,
  };
}

function bindStage() {
  const canvas = document.getElementById("stage");
  if (!canvas) return;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
}

function clientToCanvas(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function onPointerDown(event) {
  if (!currentPhoto()) return;
  const canvas = event.currentTarget;
  canvas.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, clientToCanvas(canvas, event.clientX, event.clientY));
  const point = pointers.get(event.pointerId);
  if (pointers.size === 1) {
    const hit = providers.tryOn.hitTest(point.x, point.y, state.layout?.photoRect, paintableLayers(), currentPhoto()?.slot);
    state.studio.selectedId = hit;
    const layer = selectedLayer();
    gesture = layer ? { mode: "move", id: layer.id, start: point, origX: layer.x, origY: layer.y } : null;
    updateControls();
    paintStudio();
  } else if (pointers.size === 2 && gesture) {
    const layer = state.studio.layers.find((item) => item.id === gesture.id);
    if (!layer) return;
    const [a, b] = [...pointers.values()];
    gesture = {
      mode: "pinch",
      id: layer.id,
      startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      startAngle: Math.atan2(b.y - a.y, b.x - a.x),
      origScale: layer.scale,
      origRotation: layer.rotation || 0,
    };
  }
}

function onPointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  const canvas = event.currentTarget;
  pointers.set(event.pointerId, clientToCanvas(canvas, event.clientX, event.clientY));
  if (!gesture || !state.layout?.photoRect) return;
  const layer = state.studio.layers.find((item) => item.id === gesture.id);
  if (!layer) return;
  if (gesture.mode === "move" && pointers.size === 1) {
    const point = [...pointers.values()][0];
    layer.x = clamp(gesture.origX + (point.x - gesture.start.x) / state.layout.photoRect.w, -0.2, 1.2);
    layer.y = clamp(gesture.origY + (point.y - gesture.start.y) / state.layout.photoRect.h, -0.2, 1.2);
  } else if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const limits = scaleLimits(layer);
    layer.scale = clamp(gesture.origScale * (dist / gesture.startDist), limits.min, limits.max);
    layer.rotation = gesture.origRotation + ((angle - gesture.startAngle) * 180) / Math.PI;
  }
  markDirty();
  paintStudio();
}

function onPointerUp(event) {
  pointers.delete(event.pointerId);
  if (pointers.size === 0) {
    gesture = null;
    updateControls();
  } else if (pointers.size === 1 && gesture) {
    const layer = state.studio.layers.find((item) => item.id === gesture.id);
    const point = [...pointers.values()][0];
    if (layer) gesture = { mode: "move", id: layer.id, start: point, origX: layer.x, origY: layer.y };
  }
}

function onWheel(event) {
  const layer = selectedLayer();
  if (!layer) return;
  event.preventDefault();
  const limits = scaleLimits(layer);
  layer.scale = clamp(layer.scale * (event.deltaY < 0 ? 1.06 : 0.94), limits.min, limits.max);
  markDirty();
  paintStudio();
  updateControls();
}

function scaleLimits(layer) {
  return layer.kind === "stamp" ? { min: 0.006, max: 0.08 } : { min: 0.03, max: scaleCap(layer) };
}

function onKey(event) {
  if (event.key === "Escape") {
    const confirmRoot = document.getElementById("confirm-root");
    if (confirmRoot && !confirmRoot.hidden) {
      confirmRoot.querySelector("[data-no]")?.click();
      return;
    }
    closeSheet();
    state.compare = false;
  }
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (parseRoute().path !== "dress") return;
  const layer = selectedLayer();
  if (!layer) return;
  const step = event.shiftKey ? 0.04 : 0.012;
  let used = true;
  if (event.key === "ArrowLeft") layer.x = clamp(layer.x - step, -0.2, 1.2);
  else if (event.key === "ArrowRight") layer.x = clamp(layer.x + step, -0.2, 1.2);
  else if (event.key === "ArrowUp") layer.y = clamp(layer.y - step, -0.2, 1.2);
  else if (event.key === "ArrowDown") layer.y = clamp(layer.y + step, -0.2, 1.2);
  else if (event.key === "[") layer.rotation = (layer.rotation || 0) - 5;
  else if (event.key === "]") layer.rotation = (layer.rotation || 0) + 5;
  else if (event.key === "Delete" || event.key === "Backspace") {
    deleteSelected();
    event.preventDefault();
    return;
  } else used = false;
  if (!used) return;
  event.preventDefault();
  markDirty();
  paintStudio();
  updateControls();
}

function paintableLayers() {
  return state.studio.layers.map((layer) => {
    const image = visuals.get(layer.id);
    return { ...layer, image: image || null, aspect: image ? image.naturalWidth / image.naturalHeight : 1 };
  });
}

function sceneFromState() {
  const photo = currentPhoto();
  const photoImage = photo ? visuals.get(`photo:${photo.id}`) : null;
  let layers = paintableLayers().filter((layer) => layer.kind === "stamp" || layer.image);
  if (state.compare) layers = layers.filter((layer) => layer.kind !== "stamp");
  return {
    photo: photoImage || null,
    makeupId: state.compare ? "none" : state.studio.makeupId,
    slot: photo?.slot || "",
    strength: state.studio.strength,
    layers,
    selectedId: state.studio.selectedId,
  };
}

async function ensureVisuals() {
  const photo = currentPhoto();
  if (photo && !visuals.has(`photo:${photo.id}`)) {
    visuals.set(`photo:${photo.id}`, await loadImage(mediaUrl(`photo:${photo.id}:${photo.revision || photo.createdAt}`, photo.blob)));
  }
  for (const layer of state.studio.layers) {
    if (layer.kind === "stamp" || visuals.has(layer.id)) continue;
    const src = srcForLayer(layer);
    if (!src) continue;
    try {
      visuals.set(layer.id, await loadImage(src));
    } catch {
      /* Missing sample or closet item is skipped. */
    }
  }
}

function srcForLayer(layer) {
  if (layer.source === "sample") return sampleById(layer.refId)?.src || "";
  const item = state.items.find((entry) => entry.id === layer.refId);
  if (!item?.blob) return "";
  return mediaUrl(`item:${item.id}:${item.revision || item.createdAt}`, item.blob);
}

function paintStudio() {
  const canvas = document.getElementById("stage");
  if (!canvas || !providers.tryOn.paint) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2) {
    requestAnimationFrame(paintStudio);
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  state.layout = providers.tryOn.paint(ctx, width, height, sceneFromState(), { badge: false, handles: true });
}

function updateControls() {
  const node = document.getElementById("layer-controls");
  if (node) node.innerHTML = controlsHtml();
}

async function exportSceneBlob() {
  await ensureVisuals();
  const wasComparing = state.compare;
  state.compare = false;
  const scene = sceneFromState();
  state.compare = wasComparing;
  scene.selectedId = null;
  return providers.tryOn.render(scene);
}

async function shareBlob(blob, filename, text) {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "WingsCrew Looks", text });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
  return "downloaded";
}

function fileSlug(name) {
  const base = String(name || "look").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `wingscrew-${base || "look"}.jpg`;
}

async function saveLook({ name, occasion }) {
  if (!currentPhoto()) throw new Error("Add a photo first.");
  const previewBlob = await exportSceneBlob();
  const id = state.studio.lookId && state.looks.some((look) => look.id === state.studio.lookId) ? state.studio.lookId : uid("look");
  const existing = state.looks.find((look) => look.id === id);
  const look = {
    id,
    name,
    occasion,
    photoId: state.studio.photoId,
    makeupId: state.studio.makeupId,
    strength: state.studio.strength,
    layers: state.studio.layers.map(stripLayer),
    placementVersion: PLACEMENT_VERSION,
    previewBlob,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  await db.putLook(look);
  state.studio.lookId = id;
  state.studio.dirty = false;
  state.studio.occasion = occasion;
  await reload();
  saveDraft();
  return look;
}

function openSaveSheet({ thenVote = false } = {}) {
  if (!currentPhoto()) {
    showToast("Add a photo first.");
    return;
  }
  const existing = state.looks.find((look) => look.id === state.studio.lookId);
  openSheet(`
    <h2>Save this look</h2>
    <form id="save-form">
      <label class="field">Name
        <input name="name" required maxlength="60" value="${escapeHtml(existing?.name || "")}" placeholder="Garden wedding, option 2">
      </label>
      <p class="hint">Occasion</p>
      <div class="row" style="margin-bottom:14px">
        ${OCCASIONS.map((occasion) => `<label class="chip"><input type="radio" name="occasion" value="${occasion.id}" ${occasion.id === state.studio.occasion ? "checked" : ""}>${escapeHtml(occasion.label)}</label>`).join("")}
      </div>
      <button type="submit" class="btn full">${thenVote ? "Save and open the vote" : "Save look"}</button>
    </form>`);
  document.getElementById("save-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    const data = new FormData(event.target);
    const name = String(data.get("name") || "").trim() || "Untitled look";
    const occasion = String(data.get("occasion") || state.studio.occasion || "everyday");
    try {
      const look = await saveLook({ name, occasion });
      closeSheet();
      showToast("Look saved on this device");
      if (thenVote) go(`vote/${look.id}`);
      else render();
    } catch (error) {
      button.disabled = false;
      showToast(error.message || "Could not save that look.");
    }
  });
}

function openAddSheet(from) {
  addFrom = from || "studio";
  pendingCategory = "top";
  if (pendingItem?.url) URL.revokeObjectURL(pendingItem.url);
  pendingItem = null;
  const cats = CATEGORIES.map((category) => `<button type="button" class="chip ${category.id === "top" ? "active" : ""}" data-action="pick-cat" data-cat="${category.id}">${escapeHtml(category.label)}</button>`).join("");
  openSheet(`
    <h2>${addFrom === "closet" ? "Add to My Closet" : "Add a piece"}</h2>
    <div class="row">
      <button type="button" class="btn small" data-action="pick-item" data-camera="1">Camera</button>
      <button type="button" class="btn ghost small" data-action="pick-item">Upload</button>
    </div>
    <label class="field" style="margin-top:12px">Or paste an image link
      <input id="item-url" type="url" inputmode="url" placeholder="https://">
    </label>
    <button type="button" class="btn ghost small" data-action="use-url">Use link</button>
    <p id="item-url-note" class="hint"></p>
    <div id="item-ready" hidden>
      <img id="item-preview" alt="" style="width:120px;height:120px;object-fit:contain;background:#f6efe8;border-radius:16px">
      <label class="field">Name <input id="item-name" maxlength="80" placeholder="Peach sundress"></label>
      <div class="row" id="item-cats">${cats}</div>
      <label class="check"><input id="lift-bg" type="checkbox"> Remove plain light background</label>
      <p class="hint">Best on a white or pale backdrop. Skip it for white or light-colored pieces.</p>
      ${addFrom === "closet" ? "" : `<label class="check"><input id="item-own" type="checkbox"> I own this — save to My Closet</label>`}
      <button type="button" class="btn full" data-action="commit-item">${addFrom === "closet" ? "Save to My Closet" : "Put it on this look"}</button>
    </div>`);
}

async function receiveItemBlob(blob) {
  const prepared = await downscaleImage(blob, 1400, "image/jpeg", 0.88);
  if (pendingItem?.url) URL.revokeObjectURL(pendingItem.url);
  const url = URL.createObjectURL(prepared);
  pendingItem = { original: prepared, blob: prepared, url, category: pendingCategory || "top" };
  const ready = document.getElementById("item-ready");
  const preview = document.getElementById("item-preview");
  if (ready && preview) {
    ready.hidden = false;
    preview.src = url;
  }
}

async function refreshPendingMatte() {
  if (!pendingItem) return;
  const lift = document.getElementById("lift-bg")?.checked;
  if (!lift) pendingItem.blob = pendingItem.original;
  else {
    showToast("Checking the background…");
    const result = await providers.background.remove(pendingItem.original, { strength: "gentle" });
    pendingItem.blob = result.blob;
    if (!result.removed && result.reason) showToast(result.reason);
  }
  if (pendingItem.url) URL.revokeObjectURL(pendingItem.url);
  pendingItem.url = URL.createObjectURL(pendingItem.blob);
  const preview = document.getElementById("item-preview");
  if (preview) preview.src = pendingItem.url;
}

async function commitItem() {
  if (!pendingItem?.blob) {
    showToast("Add an image first.");
    return;
  }
  const name = document.getElementById("item-name")?.value.trim() || "New piece";
  const category = pendingCategory || pendingItem.category || "top";
  const owned = addFrom === "closet" || Boolean(document.getElementById("item-own")?.checked);
  if (addFrom === "studio" && !currentPhoto() && !owned) {
    showToast("Add a photo of you first, or mark that you own it.");
    return;
  }
  const item = {
    id: uid("item"),
    name,
    category,
    owned,
    blob: pendingItem.blob,
    createdAt: Date.now(),
    revision: Date.now(),
  };
  await db.putItem(item);
  await reload();
  if (addFrom === "studio" && currentPhoto()) {
    addItemLayer(item);
    closeSheet();
    showToast(owned ? "On the look, and in My Closet" : "Added to this look");
    render();
    return;
  }
  closeSheet();
  showToast("Saved to My Closet");
  if (parseRoute().path !== "closet") go("closet");
  else render();
}

function addItemLayer(item) {
  wearIncoming({
    id: uid("layer"),
    source: "item",
    refId: item.id,
    name: item.name,
    category: item.category,
    kind: "item",
    rotation: 0,
    flip: 1,
  });
}

function addSample(id) {
  const sample = sampleById(id);
  if (!sample) return;
  wearIncoming({
    id: uid("layer"),
    source: "sample",
    refId: sample.id,
    name: sample.name,
    category: sample.category,
    kind: "item",
    rotation: 0,
    flip: 1,
  });
  render();
}

function wearIncoming(incoming) {
  if (!currentPhoto()) {
    showToast("Add a photo, or use a demo drawing, first.");
    return null;
  }
  const result = applyWear(state.studio.layers, incoming, currentPhoto().slot);
  state.studio.layers = result.layers;
  state.studio.selectedId = result.selectedId;
  if (result.added) markDirty();
  return result;
}

function clearOutfit() {
  const removed = state.studio.layers.filter((layer) => layer.kind !== "stamp");
  if (!removed.length) return;
  const snapshot = state.studio.layers.map((layer) => ({ ...layer }));
  state.studio.layers = state.studio.layers.filter((layer) => layer.kind === "stamp");
  state.studio.selectedId = null;
  markDirty();
  render();
  showToast("Outfit cleared", {
    undo: async () => {
      state.studio.layers = snapshot.map((layer) => ({ ...layer }));
      state.studio.selectedId = null;
      markDirty();
    },
  });
}

async function setMakeup(presetId) {
  const result = await providers.makeup.apply({ presetId, slot: currentPhoto()?.slot || "front" });
  state.studio.makeupId = result.presetId;
  const items = state.studio.layers.filter((layer) => layer.kind !== "stamp");
  state.studio.layers = result.mode === "overlay" ? [...items, ...result.stamps] : items;
  state.studio.selectedId = null;
  markDirty();
  render();
}

async function setPose(photoId) {
  const changed = photoId !== state.studio.photoId;
  state.studio.photoId = photoId;
  if (changed) {
    const slot = currentPhoto()?.slot || "front";
    const items = normalizeLayers(state.studio.layers, slot);
    const stamps = state.studio.makeupId && state.studio.makeupId !== "none" ? buildStamps(state.studio.makeupId, slot) : [];
    state.studio.layers = [...items, ...stamps];
    state.studio.placementVersion = PLACEMENT_VERSION;
    if (!state.studio.layers.some((layer) => layer.id === state.studio.selectedId)) state.studio.selectedId = null;
    markDirty();
  }
  if (parseRoute().path === "dress") {
    if (changed) render();
  } else go("dress");
}

function nudgeLayer(direction) {
  const sorted = [...state.studio.layers].sort((a, b) => (a.z || 0) - (b.z || 0));
  const index = sorted.findIndex((layer) => layer.id === state.studio.selectedId);
  const swap = index + direction;
  if (index < 0 || swap < 0 || swap >= sorted.length) return;
  const z = sorted[index].z;
  sorted[index].z = sorted[swap].z;
  sorted[swap].z = z === sorted[index].z ? z + direction : z;
  markDirty();
  updateControls();
  paintStudio();
}

function deleteSelected() {
  if (!state.studio.selectedId) return;
  state.studio.layers = state.studio.layers.filter((layer) => layer.id !== state.studio.selectedId);
  state.studio.selectedId = null;
  markDirty();
  updateControls();
  paintStudio();
}

async function saveLayerToCloset() {
  const layer = selectedLayer();
  if (!layer || layer.kind === "stamp") return;
  if (layer.source === "item") {
    const item = state.items.find((entry) => entry.id === layer.refId);
    if (!item) return;
    if (item.owned) {
      showToast("Already in My Closet");
      return;
    }
    item.owned = true;
    await db.putItem(item);
    await reload();
    showToast("Saved to My Closet");
    return;
  }
  const sample = sampleById(layer.refId);
  if (!sample) return;
  const response = await fetch(sample.src);
  const blob = await response.blob();
  await db.putItem({
    id: uid("item"),
    name: sample.name,
    category: sample.category,
    owned: true,
    blob,
    createdAt: Date.now(),
    revision: Date.now(),
  });
  await reload();
  showToast("Saved to My Closet");
}

function openWishSheet(source) {
  wishSource = source || {};
  const form = source?.variants ? wishlistToForm(source) : {
    name: source?.name || "",
    category: source?.category || "dress",
    store: "",
    price: "",
    sizeFirst: "",
    colorFirst: "",
    altSizes: "",
    altColors: "",
    fitNotes: "",
    link: "",
    nearbyStore: "",
    address: "",
    nearbyNote: "",
    metal: "",
    finishStone: "",
    jewelrySize: "",
    id: "",
    createdAt: "",
    lookId: source?.lookId || state.studio.lookId || "",
    itemId: source?.itemId || "",
  };
  const options = [...CATEGORIES, { id: "other", label: "Other" }].map((category) => `<option value="${category.id}" ${category.id === form.category ? "selected" : ""}>${escapeHtml(category.label)}</option>`).join("");
  openSheet(`
    <h2>${form.id ? "Edit wish" : "Add to wishlist"}</h2>
    <p class="sheet-note">Private for now. The same fields can feed a live shared registry later: first-choice size and color, alternates, and online or nearby places to buy.</p>
    <form id="wish-form" data-id="${escapeHtml(form.id)}" data-created="${escapeHtml(form.createdAt)}" data-look="${escapeHtml(form.lookId)}" data-item="${escapeHtml(form.itemId)}">
      <label class="field">Name <input name="name" required maxlength="80" value="${escapeHtml(form.name)}"></label>
      <label class="field">Category <select name="category">${options}</select></label>
      <label class="field">Store <input name="store" maxlength="80" value="${escapeHtml(form.store)}"></label>
      <label class="field">Price <input name="price" inputmode="decimal" maxlength="40" value="${escapeHtml(form.price)}" placeholder="$48"></label>
      <h3 class="serif" style="font-size:22px;margin:8px 0">Buy nearby</h3>
      <label class="field">Store name <input name="nearbyStore" maxlength="80" value="${escapeHtml(form.nearbyStore)}"></label>
      <label class="field">Address <input name="address" maxlength="240" value="${escapeHtml(form.address)}" placeholder="Street, city"></label>
      <p class="hint">An address adds an Open in Maps link.</p>
      <label class="field">Note <input name="nearbyNote" maxlength="240" value="${escapeHtml(form.nearbyNote)}" placeholder="Saw it in stock, back left rack"></label>
      <label class="field">First-choice size <input name="sizeFirst" maxlength="40" value="${escapeHtml(form.sizeFirst)}" placeholder="M"></label>
      <label class="field">First-choice color <input name="colorFirst" maxlength="40" value="${escapeHtml(form.colorFirst)}" placeholder="Sage"></label>
      <label class="field">Also OK sizes <input name="altSizes" maxlength="80" value="${escapeHtml(form.altSizes)}" placeholder="L, XL"></label>
      <label class="field">Also OK colors <input name="altColors" maxlength="80" value="${escapeHtml(form.altColors)}" placeholder="Black, Ivory"></label>
      <label class="field">Fit notes <textarea name="fitNotes" maxlength="500">${escapeHtml(form.fitNotes)}</textarea></label>
      <h3 class="serif" style="font-size:22px;margin:8px 0">Buy online</h3>
      <label class="field">Product link <input name="link" type="url" inputmode="url" value="${escapeHtml(form.link)}" placeholder="https://"></label>
      <h3 class="serif" style="font-size:22px;margin:8px 0">Jewelry details</h3>
      <label class="field">Metal <input name="metal" maxlength="40" value="${escapeHtml(form.metal)}" placeholder="Gold"></label>
      <label class="field">Finish or stone <input name="finishStone" maxlength="80" value="${escapeHtml(form.finishStone)}"></label>
      <label class="field">Ring size or length <input name="jewelrySize" maxlength="40" value="${escapeHtml(form.jewelrySize)}"></label>
      <button type="submit" class="btn full">Save wish</button>
    </form>`);
  document.getElementById("wish-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formEl = event.target;
    const data = Object.fromEntries(new FormData(formEl));
    try {
      const record = buildWishlistRecord({
        ...data,
        id: formEl.dataset.id || undefined,
        createdAt: Number(formEl.dataset.created) || undefined,
        lookId: formEl.dataset.look || null,
        itemId: formEl.dataset.item || null,
        variants: wishSource?.variants,
        places: wishSource?.places,
      });
      await db.putWish(record);
      await reload();
      closeSheet();
      showToast("Wishlist updated");
      if (parseRoute().path !== "wishlist") go("wishlist");
      else render();
    } catch (error) {
      showToast(error.message || "Could not save that wish.");
    }
  });
}

function startPick(kind, extra) {
  pick = { kind, ...extra };
  const camera = extra.camera === "1" || extra.camera === true;
  const input = document.getElementById(camera ? "file-cam" : "file-lib");
  if (camera) input.setAttribute("capture", extra.facing === "user" ? "user" : "environment");
  input.click();
}

async function onPickedFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  const current = pick;
  pick = null;
  if (!file || !current) return;
  try {
    if (current.kind === "photo") await addUserPhoto(file, current);
    if (current.kind === "item") await receiveItemBlob(file);
  } catch (error) {
    showToast(error.message || "Could not use that image.");
  }
}

async function addUserPhoto(file, current) {
  showToast("Saving your photo on this device…");
  const [base] = await providers.avatar.createBases({ blob: file, label: current.slot || "Photo" });
  const existing = current.replaceId ? state.photos.find((photo) => photo.id === current.replaceId) : null;
  const slot = existing?.slot || current.slot || "extra";
  const photo = {
    id: existing?.id || uid("photo"),
    slot,
    name: existing?.name || (slot === "extra" ? "Another pose" : PHOTO_SLOTS.find((item) => item.slot === slot)?.name || "Pose"),
    demo: false,
    blob: base.blob,
    createdAt: existing?.createdAt || Date.now(),
    revision: Date.now(),
  };
  await db.putPhoto(photo);
  visuals.delete(`photo:${photo.id}`);
  await reload();
  await setPose(photo.id);
  showToast("Photo saved on this device");
}

async function refreshDemoArt() {
  const stored = await db.getMeta("demoArtVersion");
  if (stored === DEMO_ART_VERSION) return;
  let changed = false;
  for (const pose of DEMO_POSES) {
    const existing = state.photos.find((photo) => photo.slot === pose.slot);
    if (!existing) continue;
    const response = await fetch(`${pose.src}?v=${DEMO_ART_VERSION}`, { cache: "reload" });
    if (!response.ok) continue;
    existing.blob = await response.blob();
    existing.revision = Date.now();
    await db.putPhoto(existing);
    visuals.delete(`photo:${existing.id}`);
    changed = true;
  }
  await db.setMeta("demoArtVersion", DEMO_ART_VERSION);
  if (changed) await reload();
}

async function addDemoPoses() {
  for (const pose of DEMO_POSES) {
    if (state.photos.some((photo) => photo.slot === pose.slot)) continue;
    const response = await fetch(`${pose.src}?v=${DEMO_ART_VERSION}`, { cache: "reload" });
    if (!response.ok) throw new Error("Could not load the demo drawing.");
    const blob = await response.blob();
    await db.putPhoto({
      id: uid("photo"),
      slot: pose.slot,
      name: pose.name,
      demo: true,
      blob,
      createdAt: Date.now(),
      revision: Date.now(),
    });
  }
  await reload();
  const front = state.photos.find((photo) => photo.slot === "demo-front");
  if (front) await setPose(front.id);
  else render();
  showToast("Demo drawings are ready");
}

async function deletePhoto(id) {
  const removed = state.photos.find((photo) => photo.id === id);
  if (!removed) return;
  await db.deletePhoto(id);
  visuals.delete(`photo:${id}`);
  if (state.studio.photoId === id) state.studio.photoId = null;
  await reload();
  if (!state.studio.photoId) state.studio.photoId = state.photos[0]?.id || null;
  render();
  showToast("Photo deleted", { undo: async () => db.putPhoto(removed) });
}

async function deleteMyPhotos() {
  const removed = state.photos.filter((photo) => !photo.demo);
  if (!removed.length) return;
  for (const photo of removed) {
    await db.deletePhoto(photo.id);
    visuals.delete(`photo:${photo.id}`);
  }
  if (removed.some((photo) => photo.id === state.studio.photoId)) state.studio.photoId = null;
  await reload();
  if (!state.studio.photoId) state.studio.photoId = state.photos[0]?.id || null;
  render();
  showToast("Photos deleted from this device", {
    undo: async () => {
      for (const photo of removed) await db.putPhoto(photo);
    },
  });
}

function openLook(id) {
  const look = state.looks.find((item) => item.id === id);
  if (!look) return;
  state.studio = {
    photoId: look.photoId,
    makeupId: look.makeupId || "none",
    strength: look.strength ?? 0.85,
    layers: (look.layers || []).map((layer) => ({ ...layer })),
    selectedId: null,
    occasion: look.occasion || "everyday",
    lookId: look.id,
    dirty: false,
    placementVersion: Object.prototype.hasOwnProperty.call(look, "placementVersion") ? look.placementVersion : 0,
  };
  if (needsReseat(state.studio)) state.studio = reseatStudio(state.studio);
  go("dress");
}

async function castVote(lookId, reaction) {
  const existing = state.votes.find((vote) => vote.id === `device-${lookId}`);
  await db.putVote({
    id: `device-${lookId}`,
    lookId,
    reaction,
    voter: "you",
    source: "device",
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  });
  await reload();
  render();
}

function onCompareDown(event) {
  if (event.target.closest?.('[data-action="compare"]')) {
    state.compare = true;
    paintStudio();
  }
}

function onCompareUp() {
  if (!state.compare) return;
  state.compare = false;
  paintStudio();
}

function onInput(event) {
  const action = event.target.dataset?.action;
  const layer = selectedLayer();
  if (action === "scale" && layer) {
    layer.scale = Number(event.target.value);
    event.target.closest("label")?.querySelector("b") && (event.target.closest("label").querySelector("b").textContent = Math.round(layer.scale * 100));
    markDirty();
    paintStudio();
  }
  if (action === "rotate" && layer) {
    layer.rotation = Number(event.target.value);
    const label = event.target.closest("label")?.querySelector("b");
    if (label) label.textContent = `${Math.round(layer.rotation)}°`;
    markDirty();
    paintStudio();
  }
  if (action === "strength") {
    state.studio.strength = Number(event.target.value);
    const label = event.target.closest("label")?.querySelector("b");
    if (label) label.textContent = `${Math.round(state.studio.strength * 100)}%`;
    markDirty();
    paintStudio();
  }
}

function onChange(event) {
  if (event.target.id === "age-check") {
    state.ageChecked = event.target.checked;
    const next = document.querySelector('[data-action="onboard-next"]');
    if (next) next.disabled = !state.ageChecked;
  }
  if (event.target.id === "lift-bg") {
    refreshPendingMatte().catch((error) => showToast(error.message || "Could not edit that background."));
  }
  if (event.target.dataset?.action === "rename-photo") {
    const photo = state.photos.find((item) => item.id === event.target.dataset.id);
    if (!photo) return;
    photo.name = event.target.value.trim().slice(0, 40) || photo.name;
    db.putPhoto(photo).catch(() => {});
  }
}

async function onClick(event) {
  if (event.target.closest("[data-sheet-close]")) {
    closeSheet();
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === "go") go(button.dataset.route);
    else if (action === "onboard-next") state.onboardStep = Math.min(2, state.onboardStep + 1);
    else if (action === "onboard-back") state.onboardStep = Math.max(0, state.onboardStep - 1);
    else if (action === "onboard-finish") {
      await finishOnboarding();
      return;
    } else if (action === "about") openAbout();
    else if (action === "pick-photo") {
      startPick("photo", { slot: button.dataset.slot, camera: button.dataset.camera, facing: button.dataset.facing, replaceId: button.dataset.replace });
      return;
    } else if (action === "add-extra") startPick("photo", { slot: "extra", camera: "0" });
    else if (action === "add-demo") await addDemoPoses();
    else if (action === "use-pose") await setPose(button.dataset.id);
    else if (action === "delete-photo") await deletePhoto(button.dataset.id);
    else if (action === "delete-photos") await deleteMyPhotos();
    else if (action === "makeup") await setMakeup(button.dataset.id);
    else if (action === "add-sample") addSample(button.dataset.id);
    else if (action === "filter") {
      state.sampleFilter = button.dataset.filter;
      render();
    } else if (action === "tray-closet") {
      state.sampleFilter = "closet";
      render();
    } else if (action === "open-add") openAddSheet(button.dataset.from || "studio");
    else if (action === "pick-item") startPick("item", { camera: button.dataset.camera });
    else if (action === "use-url") await useItemUrl();
    else if (action === "pick-cat") {
      pendingCategory = button.dataset.cat;
      document.querySelectorAll("[data-action='pick-cat']").forEach((chip) => chip.classList.toggle("active", chip.dataset.cat === pendingCategory));
    } else if (action === "commit-item") await commitItem();
    else if (action === "select-layer") {
      state.studio.selectedId = button.dataset.id;
      updateControls();
      paintStudio();
    } else if (action === "flip") {
      const layer = selectedLayer();
      if (!layer) return;
      layer.flip = (layer.flip || 1) * -1;
      markDirty();
      paintStudio();
    } else if (action === "layer-back") nudgeLayer(-1);
    else if (action === "layer-forward") nudgeLayer(1);
    else if (action === "delete-layer") deleteSelected();
    else if (action === "clear-outfit") clearOutfit();
    else if (action === "closet-layer") await saveLayerToCloset();
    else if (action === "wish-layer") {
      const layer = selectedLayer();
      if (!layer) return;
      openWishSheet({
        name: layer.name,
        category: layer.category,
        lookId: state.studio.lookId || "",
        itemId: layer.source === "item" ? layer.refId : "",
      });
    } else if (action === "save-look") openSaveSheet({ thenVote: false });
    else if (action === "ask-vote") {
      if (!state.studio.lookId || state.studio.dirty) openSaveSheet({ thenVote: true });
      else go(`vote/${state.studio.lookId}`);
    } else if (action === "share-studio") await shareStudio();
    else if (action === "wear") await wearItem(button.dataset.id);
    else if (action === "wish-item") {
      const item = state.items.find((entry) => entry.id === button.dataset.id);
      if (item) openWishSheet({ name: item.name, category: item.category, itemId: item.id });
    } else if (action === "delete-item") await deleteItem(button.dataset.id);
    else if (action === "new-wish") openWishSheet({});
    else if (action === "edit-wish") {
      const record = state.wishes.find((wish) => wish.id === button.dataset.id);
      if (record) openWishSheet(record);
    } else if (action === "delete-wish") await deleteWish(button.dataset.id);
    else if (action === "look-filter") {
      state.lookFilter = button.dataset.filter;
      render();
    } else if (action === "open-look") openLook(button.dataset.id);
    else if (action === "share-look") await shareSaved(button.dataset.id);
    else if (action === "delete-look") await deleteLook(button.dataset.id);
    else if (action === "vote") await castVote(button.dataset.id, button.dataset.reaction);
    else if (action === "pick-occasion") {
      state.studio.occasion = button.dataset.occasion;
      document.querySelectorAll("[data-action='pick-occasion']").forEach((chip) => chip.classList.toggle("active", chip.dataset.occasion === state.studio.occasion));
    } else if (action === "dismiss-ribbon") {
      state.dismissedRibbon = true;
      await db.setMeta("ribbon", true);
      render();
    } else if (action === "delete-all") await deleteAll();
    else return;
    if (action === "onboard-next" || action === "onboard-back") render();
  } catch (error) {
    if (error?.name === "AbortError") return;
    showToast(error.message || "Something went wrong.");
  }
}

async function useItemUrl() {
  const input = document.getElementById("item-url");
  const note = document.getElementById("item-url-note");
  const safe = safeHttpUrl(input?.value || "");
  if (!safe) {
    if (note) note.textContent = "Use a full http or https link to an image.";
    return;
  }
  if (note) note.textContent = "Fetching…";
  try {
    const response = await fetch(safe, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Could not download that image.");
    const blob = await response.blob();
    if (blob.type && !blob.type.startsWith("image/")) throw new Error("That link is not an image. Upload a photo instead.");
    await receiveItemBlob(blob);
    if (note) note.textContent = "";
  } catch {
    if (note) note.textContent = "That site doesn't share its images with other apps. Save the photo and upload it.";
  }
}

async function wearItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  if (!currentPhoto() && !state.photos.length) {
    showToast("Add a photo first, then wear this.");
    go("photos");
    return;
  }
  if (!currentPhoto()) state.studio.photoId = state.photos[0].id;
  addItemLayer(item);
  go("dress");
}

async function shareStudio() {
  if (!currentPhoto()) {
    showToast("Add a photo first.");
    return;
  }
  const blob = await exportSceneBlob();
  const name = state.looks.find((look) => look.id === state.studio.lookId)?.name || "look";
  const result = await shareBlob(blob, fileSlug(name), "Fit or Miss? Made with WingsCrew Looks. AI preview — not a real fitting.");
  if (result === "downloaded") showToast("Image downloaded");
}

async function shareSaved(id) {
  const look = state.looks.find((item) => item.id === id);
  if (!look?.previewBlob) {
    showToast("That look has no image yet.");
    return;
  }
  const result = await shareBlob(look.previewBlob, fileSlug(look.name), "Fit or Miss? Made with WingsCrew Looks. AI preview — not a real fitting.");
  if (result === "downloaded") showToast("Image downloaded");
}

async function deleteItem(id) {
  const removed = state.items.find((item) => item.id === id);
  if (!removed) return;
  await db.deleteItem(id);
  await reload();
  render();
  showToast("Removed from closet", { undo: async () => db.putItem(removed) });
}

async function deleteWish(id) {
  const removed = state.wishes.find((wish) => wish.id === id);
  if (!removed) return;
  await db.deleteWish(id);
  await reload();
  render();
  showToast("Removed from wishlist", { undo: async () => db.putWish(removed) });
}

async function deleteLook(id) {
  const removed = state.looks.find((look) => look.id === id);
  if (!removed) return;
  await db.deleteLook(id);
  const votes = state.votes.filter((vote) => vote.lookId === id);
  for (const vote of votes) await db.deleteVote(vote.id);
  if (state.studio.lookId === id) {
    state.studio.lookId = null;
    state.studio.dirty = true;
  }
  await reload();
  render();
  showToast("Look deleted", {
    undo: async () => {
      await db.putLook(removed);
      for (const vote of votes) await db.putVote(vote);
    },
  });
}

function openAbout() {
  const names = [
    providers.avatar.label,
    providers.tryOn.label,
    providers.makeup.label,
    providers.background.label,
  ].join(" · ");
  openSheet(`
    <h2>About</h2>
    <p class="lede">WingsCrew Looks is a way to try an outfit on you, save it, and decide with a friend.</p>
    <div class="sheet-note">
      <p>Photos in this prototype stay in this browser, on this device. They are not uploaded.</p>
      <p style="margin-top:8px">Every dressed image is marked AI preview. It is not a real fitting.</p>
      <p style="margin-top:8px">Active previews: ${escapeHtml(names)}.</p>
    </div>
    <div class="stack" style="margin-top:14px">
      <button type="button" class="btn ghost full" data-action="delete-photos">Delete my photos</button>
      <button type="button" class="btn rose full" data-action="delete-all">Delete everything on this device</button>
      <a class="btn ghost full" style="text-align:center;text-decoration:none" href="mailto:dovewingsbusiness@gmail.com">dovewingsbusiness@gmail.com</a>
    </div>
    ${footerHtml()}`);
}

async function deleteAll() {
  const yes = await askConfirm({
    title: "Delete everything?",
    body: "This removes photos, closet pieces, looks, wishlist items, and votes from this device.",
    confirmLabel: "Delete everything",
    danger: true,
  });
  if (!yes) return;
  await db.clearAll();
  location.reload();
}

init();
