import { CATEGORIES, DEMO_ART_VERSION, DEMO_POSES, OCCASIONS, PACKS, PHOTO_SLOTS, SAMPLES, categoryLabel, occasionLabel, sampleById, sortPhotos } from "./catalog.js?v=6";
import { db } from "./db.js";
import { downscaleImage, loadImage } from "./images.js";
import { buildStamps, hasFaceAnchor } from "./makeup.js?v=6";
import { PLACEMENT_VERSION, applyWear, needsReseat, normalizeLayers, scaleCap } from "./placement.js?v=8";
import { categoryForSlot, formatPrice, pieceQuery, showsEtsyNotice } from "./product-search.js?v=8";
import { providers } from "./providers.js?v=11";
import { DEMO_SHARE_LABEL } from "./share-links.js?v=2";
import { ageBand, ageOn, emptyCircle, isTeen, profileFromBirthdate } from "./safety.js";
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
  birthdate: "",
  birthName: "",
  ageGate: "",
  circle: emptyCircle(),
  photos: [],
  items: [],
  looks: [],
  wishes: [],
  votes: [],
  shareCounts: {},
  publicVote: null,
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
let upgradeOffers = new Map();
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

const CONTACT_EMAIL = "wingscrew-looks@wingscrew.com";
const FTC_NOTICE = "We may earn a commission from links on this page.";
const ETSY_NOTICE = "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.";
const STORE_REL = "sponsored noopener noreferrer";

function footerHtml() {
  return `<footer class="legal">© 2026 WingsCrew. All rights reserved.</footer>`;
}

function storeAnchor(url, label, className) {
  const href = providers.affiliate.wrap(url);
  if (!href) return "";
  return `<a class="${className}" href="${escapeHtml(href)}" target="_blank" rel="${STORE_REL}">${escapeHtml(label)}</a>`;
}

function parseRoute() {
  const raw = (location.hash || "#dress").replace(/^#\/?/, "");
  const [path, id] = raw.split("/");
  if (!["dress", "photos", "closet", "wishlist", "looks", "vote", "friends", "invite", "parent", "shared", "v"].includes(path)) return { path: "dress", id: "" };
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

function sheetIsOpen() {
  const sheet = document.getElementById("sheet-root");
  const confirm = document.getElementById("confirm-root");
  return Boolean((sheet && !sheet.hidden) || (confirm && !confirm.hidden));
}

function placeToast() {
  const sheet = document.querySelector("#sheet-root:not([hidden]) .sheet, #confirm-root:not([hidden]) .confirm-card");
  if (!sheet) {
    document.body.classList.remove("sheet-open");
    document.body.style.removeProperty("--toast-top");
    return;
  }
  const toast = document.getElementById("toast");
  const visible = Boolean(toast && !toast.hidden);
  if (!visible) {
    sheet.style.maxHeight = "";
    document.body.classList.remove("sheet-open");
    document.body.style.removeProperty("--toast-top");
    return;
  }
  document.body.classList.add("sheet-open");
  sheet.style.maxHeight = "";
  const height = toast.offsetHeight || 48;
  let rect = sheet.getBoundingClientRect();
  const needed = height + 18;
  if (rect.top < needed) {
    sheet.style.maxHeight = `${Math.max(180, Math.round(window.innerHeight - needed))}px`;
    rect = sheet.getBoundingClientRect();
  }
  const top = Math.max(8, Math.round(rect.top - height - 10));
  document.body.style.setProperty("--toast-top", `${top}px`);
}

function hideDemoToast() {
  const toast = document.getElementById("toast");
  if (toast && !toast.hidden && toast.textContent.includes("Demo drawings are ready")) hideToast();
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
  if (message === "Demo drawings are ready" && sheetIsOpen()) return;
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
  placeToast();
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
  hideDemoToast();
  placeToast();
  return new Promise((resolve) => {
    const finish = (value) => {
      root.hidden = true;
      root.innerHTML = "";
      placeToast();
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
  hideDemoToast();
  placeToast();
  return root;
}

function closeSheet() {
  const root = document.getElementById("sheet-root");
  root.hidden = true;
  root.innerHTML = "";
  if (pendingItem?.url) URL.revokeObjectURL(pendingItem.url);
  pendingItem = null;
  placeToast();
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
        <button type="button" class="teen-pill" data-action="go" data-route="friends" hidden>Teen</button>
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
  document.getElementById("view").innerHTML = `<p class="lede">Opening your looks…</p>${footerHtml()}`;
  try {
    state.profile = await db.getMeta("profile");
    state.circle = { ...emptyCircle(), ...(await db.getMeta("circle") || {}) };
    state.dismissedRibbon = Boolean(await db.getMeta("ribbon"));
    await reload();
    if (state.profile?.onboarded) await refreshDemoArt();
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
  const route = parseRoute();
  if (route.path === "parent") {
    header.hidden = true;
    nav.hidden = true;
    document.body.classList.remove("onboarding");
    view.innerHTML = parentHtml(route.id);
    return;
  }
  if (route.path === "v") {
    header.hidden = true;
    nav.hidden = true;
    document.body.classList.remove("onboarding");
    document.body.dataset.route = "v";
    view.innerHTML = publicVoteHtml(route.id);
    return;
  }
  const onboarded = Boolean(state.profile?.onboarded) && !state.error;
  header.hidden = !onboarded;
  nav.hidden = !onboarded;
  const teenPill = header.querySelector(".teen-pill");
  if (teenPill) teenPill.hidden = !onboarded || !isTeen(state.profile);
  document.body.classList.toggle("onboarding", !onboarded);
  if (state.error) {
    view.innerHTML = `<section class="empty"><h2>Can't store photos here</h2><p class="lede">${escapeHtml(state.error)} Try a regular Safari or Chrome tab.</p>${footerHtml()}</section>`;
    return;
  }
  if (!onboarded) {
    view.innerHTML = onboardHtml();
    return;
  }
  document.body.dataset.route = route.path;
  nav.querySelectorAll("button").forEach((button) => {
    const on = button.dataset.route === route.path || (route.path === "vote" && button.dataset.route === "looks");
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (route.path === "photos") view.innerHTML = photosHtml();
  else if (route.path === "closet") view.innerHTML = closetHtml();
  else if (route.path === "wishlist") view.innerHTML = wishlistHtml();
  else if (route.path === "looks") {
    view.innerHTML = looksHtml();
    queueShareCounts();
  } else if (route.path === "vote") {
    view.innerHTML = voteHtml(route.id);
    queueShareCounts();
  }
  else if (route.path === "friends") view.innerHTML = friendsHtml();
  else if (route.path === "invite") view.innerHTML = inviteHtml(route.id);
  else if (route.path === "shared") view.innerHTML = sharedHtml(route.id);
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
    const today = new Date().toISOString().slice(0, 10);
    return `<section class="onboard">
      <div><p class="steps" aria-hidden="true">${dots}</p>
        <h1>Your birthday</h1>
        <p class="lede">We use it once, to choose the right mode. Under 13 stops here, and nothing is saved.</p>
        <label class="field">Birthday
          <input id="birthdate" type="date" max="${today}" min="1900-01-01" required value="${escapeHtml(state.birthdate)}" autocomplete="bday">
        </label>
      </div>
      <div class="stack">
        <button type="button" class="btn full" data-action="onboard-next" ${state.birthdate ? "" : "disabled"}>Continue</button>
        <button type="button" class="btn ghost full" data-action="onboard-back">Back</button>
      </div>
      ${footerHtml()}
    </section>`;
  }
  if (state.ageGate === "blocked") {
    return `<section class="onboard">
      <div><p class="steps" aria-hidden="true">${dots}</p>
        <h1>Not yet</h1>
        <p class="lede">WingsCrew Looks isn't available if you're under 13. We didn't create an account, and we didn't save this birthday.</p>
      </div>
      <div class="stack">
        <button type="button" class="btn full" data-action="onboard-back">Try a different birthday</button>
      </div>
      ${footerHtml()}
    </section>`;
  }
  const teen = state.ageGate === "teen";
  return `<section class="onboard">
    <div><p class="steps" aria-hidden="true">${dots}</p>
      <h1>${teen ? "Teen mode" : "Your photos stay here"}</h1>
      ${teen ? `<p class="lede">You're 13 to 17, so Teen mode is on. Sharing is invite-only to people you know.</p>
        <label class="field">What should friends call you?
          <input id="teen-name" maxlength="40" value="${escapeHtml(state.birthName)}" autocomplete="given-name" placeholder="First name">
        </label>` : ""}
      <ul class="bullets">
        <li>In this prototype, photos are stored only on this device, in this browser.</li>
        <li>They are not uploaded to WingsCrew or anyone else.</li>
        ${teen ? `<li>Looks stay private. Video export stays off until you turn it on.</li>
        <li>A parent link, if you make one, shows your friends list only.</li>` : `<li>Delete them anytime with one tap on the Photos page.</li>`}
        <li>A look is a preview, not a real fitting.</li>
      </ul>
    </div>
    <div class="stack">
      <button type="button" class="btn full" data-action="onboard-finish">${teen ? "Start Teen mode" : "Keep photos on this device"}</button>
      <button type="button" class="btn ghost full" data-action="onboard-back">Back</button>
    </div>
    ${footerHtml()}
  </section>`;
}

function advanceOnboarding() {
  if (state.onboardStep <= 0) {
    state.onboardStep = 1;
    return;
  }
  const input = document.getElementById("birthdate");
  if (input) state.birthdate = input.value;
  const band = ageBand(ageOn(state.birthdate, new Date()));
  if (band === "invalid") {
    showToast("Enter a real birthday.");
    return;
  }
  state.ageGate = band;
  state.onboardStep = 2;
}

async function finishOnboarding() {
  const nameInput = document.getElementById("teen-name");
  if (nameInput) state.birthName = nameInput.value;
  const profile = profileFromBirthdate({
    birthdate: state.birthdate,
    displayName: state.birthName,
    today: new Date(),
  });
  if (!profile) {
    if (state.ageGate === "teen") showToast("Add a first name so friends know the invite is from you.");
    return;
  }
  state.profile = profile;
  await db.setMeta("profile", state.profile);
  await refreshDemoArt();
  go(profile.ageBand === "teen" ? "friends" : "photos");
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
        ${packsHtml()}
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

function packsHtml() {
  const packs = providers.circle.visiblePacks(PACKS, state.profile);
  const names = packs.map((pack) => escapeHtml(pack.name)).join(" · ");
  const teenNote = isTeen(state.profile) ? " Adult packs and sponsored adult items stay hidden." : "";
  return `<p class="hint">Packs: ${names}.${teenNote}</p>`;
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

function wornPieces(layers) {
  return (layers || []).filter((layer) => layer && layer.kind !== "stamp");
}

function upgradeListHtml(layers) {
  const pieces = wornPieces(layers);
  if (!pieces.length) return "";
  return `<div class="piece-upgrades">${pieces.map((layer) => {
    const name = layer.name || pieceQuery(layer).slotLabel;
    return `<div class="piece-upgrade"><span class="piece-name">${escapeHtml(name)}</span><button type="button" class="chip upgrade-chip" data-action="upgrade" data-id="${escapeHtml(layer.id)}" aria-label="Upgrade ${escapeHtml(name)}">Upgrade</button></div>`;
  }).join("")}</div>`;
}

function controlsHtml() {
  const sorted = [...state.studio.layers].sort((a, b) => (a.z || 0) - (b.z || 0));
  const list = sorted.length
    ? `<div class="scroller">${sorted.map((layer) => `<button type="button" class="chip ${layer.id === state.studio.selectedId ? "active" : ""}" data-action="select-layer" data-id="${layer.id}">${escapeHtml(layer.name || "Piece")}</button>`).join("")}</div>${upgradeListHtml(sorted)}`
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
      ${online?.url ? storeAnchor(online.url, "View item", "btn ghost small") : ""}
      ${online?.url && providers.affiliate.wrap(online.url) ? `<p class="disclose wish-disclose">${FTC_NOTICE}</p>` : ""}
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
    <div class="section-head"><div><h2>Looks</h2><p class="lede">${isTeen(state.profile) ? "Private by default. A look you send is visible only to an approved friend." : "Saved on this device, with the occasion you picked."}</p></div></div>
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
    ${shareCountsHtml(look.id)}
    ${upgradeListHtml(look.layers)}
    <div class="card-actions">
      <button type="button" class="btn small" data-action="open-look" data-id="${look.id}">Open</button>
      <button type="button" class="btn ghost small" data-action="go" data-route="vote/${look.id}">Vote</button>
      ${shareLinkButtons(look.id)}
      <button type="button" class="btn ghost small" data-action="share-look" data-id="${look.id}">Share</button>
      <button type="button" class="btn ghost small" data-action="delete-look" data-id="${look.id}">Delete</button>
    </div>
  </article>`;
}

function voteHtml(id) {
  const look = state.looks.find((item) => item.id === id);
  if (!look) return `<section class="empty"><h2>That look isn't here</h2><button type="button" class="btn" data-action="go" data-route="looks">Back to looks</button>${footerHtml()}</section>`;
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
    ${upgradeListHtml(look.layers)}
    <div class="vote-buttons">
      ${button("heart", "Heart", "♥")}
      ${button("meh", "Meh", "–")}
      ${button("no", "No", "×")}
    </div>
    <p class="hint">${isTeen(state.profile) ? "Only you and approved friends can vote. Votes from anyone else are ignored. Nothing here is public." : "Heart, meh, and no stay on this device. Share link collects Fit or Miss from anyone with the link."}</p>
    ${shareCountsHtml(look.id)}
    ${shareLinkButtons(look.id, "full")}
    <button type="button" class="btn full" data-action="share-look" data-id="${look.id}">Share image</button>
    ${footerHtml()}
  </section>`;
}

function shareLinkButtons(lookId, size = "small") {
  if (isTeen(state.profile)) return "";
  const width = size === "full" ? "full" : "small";
  const active = state.shareCounts?.[lookId];
  return `<button type="button" class="btn ${width}" data-action="share-link" data-id="${escapeHtml(lookId)}">Share link</button>${active ? `<button type="button" class="btn ghost ${width}" data-action="revoke-link" data-id="${escapeHtml(lookId)}">Stop sharing</button>` : ""}`;
}

function shareCountsHtml(lookId) {
  const row = state.shareCounts?.[lookId];
  if (!row) return "";
  const demo = providers.shareLinks.demo() ? `<p class="hint demo-share">${escapeHtml(DEMO_SHARE_LABEL)}</p>` : "";
  return `<p class="hint share-counts">Fit ${row.fit} · Miss ${row.miss}</p>${demo}`;
}

let sharePaint = 0;
function queueShareCounts() {
  const paint = ++sharePaint;
  refreshShareCounts(paint).catch(() => {});
}

async function refreshShareCounts(paint = ++sharePaint) {
  const rows = providers.shareLinks.owned().filter((row) => row.lookId && !row.revoked);
  const next = {};
  for (const row of rows) {
    const tally = await providers.shareLinks.counts(row.token);
    if (!tally?.ok) continue;
    next[row.lookId] = { token: row.token, fit: tally.fit, miss: tally.miss };
  }
  if (paint !== sharePaint) return false;
  const prev = JSON.stringify(state.shareCounts || {});
  const serialized = JSON.stringify(next);
  state.shareCounts = next;
  if (prev === serialized) return false;
  const path = parseRoute().path;
  if (path === "looks" || path === "vote") render();
  return true;
}

function voteTally(lookId) {
  const rows = state.votes.filter((vote) => vote.lookId === lookId && providers.circle.allowVote(state.profile, state.circle, vote));
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
    sharing: isTeen(state.profile) ? { mode: "private", audience: "approved-friends" } : { mode: "private" },
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

function findWornPiece(id) {
  if (!id) return null;
  const studio = wornPieces(state.studio.layers).find((layer) => layer.id === id);
  if (studio) return studio;
  for (const look of state.looks) {
    const layer = wornPieces(look.layers).find((item) => item.id === id);
    if (layer) return layer;
  }
  return null;
}

function occasionForPiece(layer) {
  const sample = sampleById(layer?.refId);
  const look = state.looks.find((item) => wornPieces(item.layers).some((entry) => entry.id === layer?.id));
  const studioOccasion = wornPieces(state.studio.layers).some((item) => item.id === layer?.id) ? state.studio.occasion : "";
  return [sample?.occasion, look?.occasion, studioOccasion].filter(Boolean).join(" ");
}

function searchShowsExamples() {
  const search = providers.productSearch;
  if (typeof search?.exampleData === "function") return search.exampleData();
  return search?.id === "demo";
}

async function openUpgrade(layerId) {
  const layer = findWornPiece(layerId);
  if (!layer) return;
  const request = pieceQuery({ ...layer, occasion: occasionForPiece(layer) });
  let items = [];
  try {
    items = await providers.productSearch.search({
      query: request.query,
      type: request.type,
      color: request.color,
      teen: isTeen(state.profile),
    });
  } catch {
    items = [];
  }
  items = items.filter((item) => !isTeen(state.profile) || (!item.adultSponsored && item.audience !== "18+" && item.sponsorCategory !== "adult"));
  upgradeOffers = new Map(items.map((item) => [item.id, item]));
  const cards = items.map((item) => {
    return `<article class="upgrade-card">
      ${item.image ? `<img alt="" src="${escapeHtml(item.image)}">` : `<div class="ph"></div>`}
      <strong>${escapeHtml(item.title)}</strong>
      <p class="upgrade-price">${escapeHtml(formatPrice(item.price, item.currency))}</p>
      <p class="hint">${escapeHtml(item.store)}</p>
      ${storeAnchor(item.url, "View at store", "btn small")}
      <button type="button" class="btn ghost small" data-action="upgrade-wish" data-id="${escapeHtml(item.id)}" data-layer="${escapeHtml(layer.id)}">Add to wishlist</button>
    </article>`;
  }).join("");
  openSheet(`
    <h2>Upgrade this piece</h2>
    <p class="hint">${escapeHtml(layer.name || request.slotLabel)} · ${escapeHtml(request.slotLabel)}</p>
    ${searchShowsExamples() ? `<p class="example-label">Example items</p>` : ""}
    ${items.length ? `<div class="scroller upgrade-scroller" aria-label="Similar pieces">${cards}</div>` : `<p class="hint">No similar pieces yet.</p>`}
    <p class="disclose">${FTC_NOTICE}</p>
    <p class="disclose etsy-notice"${showsEtsyNotice(items) ? "" : " hidden"}>${ETSY_NOTICE}</p>`);
}

function openUpgradeWish(productId, layerId) {
  const offer = upgradeOffers.get(productId);
  const layer = findWornPiece(layerId);
  if (!offer) return;
  const request = pieceQuery({ ...(layer || {}), occasion: layer ? occasionForPiece(layer) : "" });
  openWishSheet({
    name: offer.title,
    category: categoryForSlot(offer.type || request.type),
    store: offer.store,
    price: formatPrice(offer.price, offer.currency),
    colorFirst: offer.color || request.color || "",
    sizeFirst: "",
    link: providers.affiliate.wrap(offer.url),
    lookId: state.studio.lookId || state.looks.find((look) => wornPieces(look.layers).some((item) => item.id === layerId))?.id || "",
    itemId: layer?.source === "item" ? layer.refId : "",
  });
}

function openWishSheet(source) {
  wishSource = source || {};
  const form = source?.variants ? wishlistToForm(source) : {
    name: source?.name || "",
    category: source?.category || "dress",
    store: source?.store || "",
    price: source?.price || "",
    sizeFirst: source?.sizeFirst || "",
    colorFirst: source?.colorFirst || "",
    altSizes: "",
    altColors: "",
    fitNotes: "",
    link: source?.link || "",
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
  const vote = { source: "device", voter: "you", friendId: "" };
  if (!providers.circle.allowVote(state.profile, state.circle, vote)) {
    showToast("Only approved friends can vote.");
    return;
  }
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
  if (event.target.id === "birthdate") {
    state.birthdate = event.target.value;
    const next = document.querySelector('[data-action="onboard-next"]');
    if (next) next.disabled = !state.birthdate;
  }
  if (event.target.id === "teen-name") state.birthName = event.target.value;
  if (event.target.id === "video-export" && isTeen(state.profile)) {
    state.profile = { ...state.profile, videoExport: event.target.checked };
    db.setMeta("profile", state.profile).catch(() => {});
    showToast(event.target.checked ? "Video export is on" : "TikTok and video export are off");
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
    else if (action === "onboard-next") advanceOnboarding();
    else if (action === "onboard-back") {
      state.onboardStep = Math.max(0, state.onboardStep - 1);
      if (state.onboardStep < 2) state.ageGate = "";
    }
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
    else if (action === "upgrade") await openUpgrade(button.dataset.id);
    else if (action === "upgrade-wish") openUpgradeWish(button.dataset.id, button.dataset.layer);
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
    else if (action === "share-link") await publishShareLink(button.dataset.id);
    else if (action === "revoke-link") await revokeShareLink(button.dataset.id);
    else if (action === "public-vote") await castPublicVote(button.dataset.token, button.dataset.choice);
    else if (action === "create-invite") await createFriendInvite();
    else if (action === "send-invite") await sendInviteLink(button.dataset.token);
    else if (action === "accept-invite") await acceptFriendInvite(button.dataset.token);
    else if (action === "approve-friend") await approveFriend(button.dataset.id);
    else if (action === "remove-friend") await setFriendStatus(button.dataset.id, "remove");
    else if (action === "block-friend") await setFriendStatus(button.dataset.id, "block");
    else if (action === "report-friend") await reportFriend(button.dataset.id);
    else if (action === "parent-link") await makeParentLink();
    else if (action === "copy-parent") await copyText(parentUrl(state.circle.parentToken), "Parent link copied");
    else if (action === "send-look") await sendLookToFriend(button.dataset.id, button.dataset.friend, button.dataset.video === "1");
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
  if (isTeen(state.profile)) {
    if (!state.studio.lookId || state.studio.dirty) {
      showToast("Save the look first. Teen mode only sends a saved look to an approved friend.");
      return;
    }
    openTeenShare(state.studio.lookId);
    return;
  }
  const blob = await exportSceneBlob();
  const name = state.looks.find((look) => look.id === state.studio.lookId)?.name || "look";
  const result = await shareBlob(blob, fileSlug(name), "Fit or Miss? Made with WingsCrew Looks. AI preview — not a real fitting.");
  if (result === "downloaded") showToast("Image downloaded");
}

async function publishShareLink(lookId) {
  if (isTeen(state.profile)) {
    showToast("Teen mode has no public link.");
    return;
  }
  const look = state.looks.find((item) => item.id === lookId);
  if (!look?.previewBlob) {
    showToast("That look has no image yet.");
    return;
  }
  const existing = providers.shareLinks.owned().find((item) => item.lookId === lookId && !item.revoked);
  const published = existing
    ? { token: existing.token, url: providers.shareLinks.url(existing.token) }
    : await providers.shareLinks.publish({
      lookId: look.id,
      name: look.name,
      occasion: look.occasion,
      image: look.previewBlob,
    });
  if (published.error || !published.url) {
    showToast(published.error || "Could not make that link.");
    return;
  }
  await shareVoteLink(published.url);
  await refreshShareCounts();
}

async function shareVoteLink(url) {
  const text = "Fit or Miss? Vote on my look";
  if (navigator.share) {
    try {
      await navigator.share({ title: "WingsCrew Looks", text, url });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyText(url, "Link copied");
}

async function revokeShareLink(lookId) {
  const existing = providers.shareLinks.owned().find((item) => item.lookId === lookId && !item.revoked);
  if (!existing) return;
  const result = await providers.shareLinks.revoke(existing.token);
  if (!result?.ok) {
    showToast(result?.error || "Could not stop sharing.");
    return;
  }
  showToast("Sharing stopped");
  await refreshShareCounts();
}

async function shareSaved(id) {
  const look = state.looks.find((item) => item.id === id);
  if (!look?.previewBlob) {
    showToast("That look has no image yet.");
    return;
  }
  if (isTeen(state.profile)) {
    openTeenShare(id);
    return;
  }
  const result = await shareBlob(look.previewBlob, fileSlug(look.name), "Fit or Miss? Made with WingsCrew Looks. AI preview — not a real fitting.");
  if (result === "downloaded") showToast("Image downloaded");
}

function openTeenShare(lookId) {
  const look = state.looks.find((item) => item.id === lookId);
  if (!look) {
    showToast("Save the look first.");
    return;
  }
  const approved = (state.circle.friends || []).filter((friend) => friend.status === "approved");
  const videoOn = Boolean(state.profile?.videoExport);
  openSheet(`
    <h2>Send this look</h2>
    <p class="lede">Private. Only an approved friend can open it. There is no public link.</p>
    ${approved.length ? `<div class="stack">${approved.map((friend) => `<button type="button" class="btn full" data-action="send-look" data-id="${look.id}" data-friend="${friend.id}">Send still to ${escapeHtml(friend.name)}</button>`).join("")}</div>` : `<p class="hint">Approve a friend first. Sharing is invite-only.</p><button type="button" class="btn full" data-action="go" data-route="friends">Friends</button>`}
    <p class="hint">${videoOn ? "Video export is on. This prototype still sends a still image, and only to an approved friend." : "TikTok and video export are off until you turn them on in Friends."}</p>
    ${videoOn && approved.length ? `<div class="stack">${approved.map((friend) => `<button type="button" class="btn ghost full" data-action="send-look" data-id="${look.id}" data-friend="${friend.id}" data-video="1">Export video to ${escapeHtml(friend.name)}</button>`).join("")}</div>` : ""}`);
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
  const shared = providers.shareLinks.owned().find((item) => item.lookId === id && !item.revoked);
  if (shared) await providers.shareLinks.revoke(shared.token);
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

function friendsHtml() {
  const friends = state.circle.friends || [];
  const pending = friends.filter((friend) => friend.status === "pending");
  const approved = friends.filter((friend) => friend.status === "approved");
  const blocked = friends.filter((friend) => friend.status === "blocked");
  const invite = [...(state.circle.invites || [])].reverse()[0];
  const link = invite ? inviteUrl(invite.token) : "";
  return `<section>
    <div class="section-head"><div><h2>Friends</h2><p class="lede">Invite-only, to people you know. No public profile and no search.</p></div></div>
    <article class="card">
      <h3>Invite</h3>
      <p class="hint">Send a personal link from this phone. They accept, then you approve them by name.</p>
      <button type="button" class="btn full" data-action="create-invite">Invite someone you know</button>
      ${link ? `<label class="field" style="margin-top:12px">Personal link<input readonly value="${escapeHtml(link)}"></label>
        <button type="button" class="btn" data-action="send-invite" data-token="${escapeHtml(invite.token)}">Send invite</button>` : ""}
    </article>
    <article class="card">
      <h3>Waiting for you</h3>
      ${pending.length ? pending.map((friend) => `<div class="friend-row"><div><strong>${escapeHtml(friend.name)}</strong><p class="hint">Accepted your invite</p></div><button type="button" class="btn small" data-action="approve-friend" data-id="${friend.id}">Approve ${escapeHtml(friend.name)}</button></div>`).join("") : `<p class="hint">When a friend accepts, their name shows up here for you to approve.</p>`}
    </article>
    <article class="card">
      <h3>Approved</h3>
      ${approved.length ? approved.map((friend) => friendActions(friend)).join("") : `<p class="hint">No approved friends yet. Looks stay private.</p>`}
    </article>
    ${blocked.length ? `<article class="card"><h3>Blocked</h3>${blocked.map((friend) => `<div class="friend-row"><strong>${escapeHtml(friend.name)}</strong><span class="hint">Can't see looks or vote</span></div>`).join("")}</article>` : ""}
    <article class="card">
      <h3>Video export</h3>
      <label class="check"><input id="video-export" type="checkbox" ${state.profile?.videoExport ? "checked" : ""}> TikTok and video export</label>
      <p class="hint">Off until you turn it on. Shared photos are still only for approved friends.</p>
    </article>
    <article class="card">
      <h3>Parent link</h3>
      <p class="hint">Optional. A parent can view this friends list only, not your looks or photos.</p>
      ${state.circle.parentToken ? `<label class="field">Parent link<input readonly value="${escapeHtml(parentUrl(state.circle.parentToken))}"></label><button type="button" class="btn ghost" data-action="copy-parent">Copy parent link</button>` : `<button type="button" class="btn ghost" data-action="parent-link">Create a parent link</button>`}
    </article>
    <p class="hint">Matching phone contacts comes with the native app. This web app uses invite links only.</p>
    ${footerHtml()}
  </section>`;
}

function friendActions(friend) {
  return `<div class="friend-row">
    <strong>${escapeHtml(friend.name)}</strong>
    <div class="row">
      <button type="button" class="btn ghost small" data-action="remove-friend" data-id="${friend.id}">Remove</button>
      <button type="button" class="btn ghost small" data-action="block-friend" data-id="${friend.id}">Block</button>
      <button type="button" class="btn ghost small" data-action="report-friend" data-id="${friend.id}">Report</button>
    </div>
  </div>`;
}

function inviteHtml(token) {
  const invite = (state.circle.invites || []).find((item) => item.token === token);
  if (!invite) {
    return `<section class="empty"><h2>Invite not on this phone</h2><p class="lede">This prototype keeps the invite on the phone that created it. True delivery to another phone needs the backend. Phone-contact matching comes with the native app.</p><button type="button" class="btn" data-action="go" data-route="friends">Back</button>${footerHtml()}</section>`;
  }
  const used = (state.circle.friends || []).some((friend) => friend.inviteToken === token && friend.status !== "removed");
  if (used) {
    return `<section class="empty"><h2>Already accepted</h2><p class="lede">This invite is waiting for approval, or it's already on the friends list.</p><button type="button" class="btn" data-action="go" data-route="friends">Back to friends</button>${footerHtml()}</section>`;
  }
  const from = state.profile?.displayName || "A friend";
  return `<section>
    <div class="section-head"><div><h2>Accept invite</h2><p class="lede">${escapeHtml(from)} invited you. Enter your name. They still have to approve you.</p></div></div>
    <article class="card">
      <label class="field">Your name<input id="friend-accept-name" maxlength="40" placeholder="First name"></label>
      <button type="button" class="btn full" data-action="accept-invite" data-token="${escapeHtml(token)}">Accept invite</button>
      <p class="hint">There is no search and no public profile. This web app uses invite links. Matching phone contacts comes with the native app.</p>
    </article>
    ${footerHtml()}
  </section>`;
}

function parentHtml(token) {
  const snapshot = providers.circle.parentSnapshot(state.circle, token);
  if (!snapshot) {
    return `<section class="onboard"><div><h1>Parent link</h1><p class="lede">This link isn't valid on this phone. In this prototype the parent view opens on the teen's device.</p></div>${footerHtml()}</section>`;
  }
  const rows = snapshot.friends.length
    ? snapshot.friends.map((friend) => `<div class="friend-row"><strong>${escapeHtml(friend.name)}</strong><span class="tag">${escapeHtml(friend.status)}</span></div>`).join("")
    : `<p class="hint">No friends yet.</p>`;
  return `<section class="onboard">
    <div>
      <h1>Friends</h1>
      <p class="lede">Approved friends, and nothing else. Looks, photos, and votes are not on this page.</p>
      <article class="card" style="margin-top:16px">${rows}</article>
    </div>
    ${footerHtml()}
  </section>`;
}

let publicVoteSeq = 0;

function publicVoteHtml(token) {
  const page = state.publicVote;
  if (!page || page.token !== token || page.loading) {
    if (!page || page.token !== token) {
      state.publicVote = { token, loading: true };
      loadPublicVote(token);
    }
    return `<section class="vote"><p class="lede">Opening this look…</p>${footerHtml()}</section>`;
  }
  if (!page.look) {
    return `<section class="vote">
      <h2>This link isn't available</h2>
      <p class="lede">${page.demo ? escapeHtml(DEMO_SHARE_LABEL) : "The owner may have stopped sharing it."}</p>
      ${footerHtml()}
    </section>`;
  }
  const src = publicImageSrc(token, page.look.image);
  const mine = page.choice;
  const button = (choice, label) => `<button type="button" class="vote-btn ${mine === choice ? "on" : ""}" data-action="public-vote" data-token="${escapeHtml(token)}" data-choice="${choice}" data-reaction="${choice}"><b>${label}</b></button>`;
  return `<section class="vote">
    <p class="hint">WingsCrew Looks</p>
    ${src ? `<img alt="${escapeHtml(page.look.name)}" src="${src}">` : ""}
    <p class="tag ${escapeHtml(page.look.occasion)}">${escapeHtml(occasionLabel(page.look.occasion))}</p>
    <h2>Fit or Miss?</h2>
    <p class="lede">${escapeHtml(page.look.name)}</p>
    <p class="hint">Preview, not a fitting.</p>
    <div class="vote-buttons pair">
      ${button("fit", "Fit")}
      ${button("miss", "Miss")}
    </div>
    <p class="hint">${mine ? `You voted ${mine === "fit" ? "Fit" : "Miss"}. One vote on this phone.` : "One vote on this phone."}</p>
    ${page.demo ? `<p class="hint demo-share">${escapeHtml(DEMO_SHARE_LABEL)}</p>` : ""}
    ${footerHtml()}
  </section>`;
}

function publicImageSrc(token, image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  return mediaUrl(`public:${token}`, image);
}

async function loadPublicVote(token) {
  const seq = ++publicVoteSeq;
  const demo = providers.shareLinks.demo();
  try {
    const look = await providers.shareLinks.get(token);
    if (seq !== publicVoteSeq) return;
    state.publicVote = {
      token,
      loading: false,
      look,
      choice: providers.shareLinks.deviceChoice(token),
      demo,
    };
  } catch {
    if (seq !== publicVoteSeq) return;
    state.publicVote = { token, loading: false, look: null, choice: "", demo };
  }
  if (parseRoute().path === "v" && parseRoute().id === token) render();
}

async function castPublicVote(token, choice) {
  const result = await providers.shareLinks.vote(token, choice, providers.shareLinks.deviceId());
  if (!result?.ok) {
    showToast(result?.error || "Could not save that vote.");
    return;
  }
  state.publicVote = {
    ...(state.publicVote || { token, look: null, demo: providers.shareLinks.demo() }),
    token,
    loading: false,
    choice: result.choice,
  };
  render();
  if (result.duplicate) showToast("You already voted.");
}

function sharedHtml(token) {
  const view = providers.circle.canViewShare(state.circle, token);
  const look = view ? state.looks.find((item) => item.id === view.lookId) : null;
  if (!look) {
    return `<section class="empty"><h2>This look is private</h2><p class="lede">Only an approved friend can open a look sent from Teen mode.</p>${footerHtml()}</section>`;
  }
  const src = look.previewBlob ? mediaUrl(`preview:${look.id}:${look.updatedAt}`, look.previewBlob) : "";
  return `<section class="vote">
    <h2>${escapeHtml(look.name)}</h2>
    ${src ? `<img alt="${escapeHtml(look.name)}" src="${src}">` : ""}
    <p class="hint">Visible because you are an approved friend. This is not a public page.</p>
    ${upgradeListHtml(look.layers)}
    ${footerHtml()}
  </section>`;
}

function inviteUrl(token) {
  const url = new URL(location.href);
  url.hash = `invite/${token}`;
  return url.href;
}

function parentUrl(token) {
  const url = new URL(location.href);
  url.hash = `parent/${token}`;
  return url.href;
}

function shareUrl(token) {
  const url = new URL(location.href);
  url.hash = `shared/${token}`;
  return url.href;
}

async function saveCircle() {
  await db.setMeta("circle", state.circle);
}

async function createFriendInvite() {
  const result = providers.circle.createInvite(state.circle);
  state.circle = result.circle;
  await saveCircle();
  render();
  showToast("Invite ready to send");
}

async function sendInviteLink(token) {
  const url = inviteUrl(token);
  const who = state.profile?.displayName || "A friend";
  const text = `${who} invited you to WingsCrew Looks. This invite is only for you.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "WingsCrew Looks", text, url });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyText(url, "Invite link copied");
}

async function acceptFriendInvite(token) {
  const name = document.getElementById("friend-accept-name")?.value || "";
  const result = providers.circle.acceptInvite(state.circle, { token, friendName: name });
  if (result.error) {
    showToast(result.error);
    return;
  }
  state.circle = result.circle;
  await saveCircle();
  showToast(`${result.friend.name} accepted. Approve them by name.`);
  go("friends");
}

async function approveFriend(id) {
  const result = providers.circle.approveFriend(state.circle, { id });
  if (result.error) {
    showToast(result.error);
    return;
  }
  state.circle = result.circle;
  await saveCircle();
  showToast(`${result.friend.name} is approved`);
  render();
}

async function setFriendStatus(id, kind) {
  const result = kind === "block" ? providers.circle.blockFriend(state.circle, { id }) : providers.circle.removeFriend(state.circle, { id });
  state.circle = result.circle;
  await saveCircle();
  showToast(kind === "block" ? "Blocked. They can't see looks or vote." : "Removed from friends");
  render();
}

async function reportFriend(id) {
  const result = providers.circle.reportFriend(state.circle, { id });
  if (result.error) {
    showToast(result.error);
    return;
  }
  state.circle = result.circle;
  await saveCircle();
  showToast(`Reported ${result.report.friendName}. A hosted app would send this to WingsCrew.`);
}

async function makeParentLink() {
  const result = providers.circle.createParentLink(state.circle);
  state.circle = result.circle;
  await saveCircle();
  render();
  showToast("Parent link ready. It shows the friends list only.");
}

async function sendLookToFriend(lookId, friendId, video) {
  if (video && !state.profile?.videoExport) {
    showToast("TikTok and video export are off.");
    return;
  }
  if (!providers.circle.allowLookShare(state.profile, state.circle, friendId)) {
    showToast("Only an approved friend can receive a look.");
    return;
  }
  const result = providers.circle.shareLookWith(state.circle, { lookId, friendId, video });
  if (result.error) {
    showToast(result.error);
    return;
  }
  state.circle = result.circle;
  await saveCircle();
  closeSheet();
  const friend = (state.circle.friends || []).find((item) => item.id === friendId);
  await copyText(shareUrl(result.share.token), video ? `Video export link copied for ${friend?.name || "your friend"}` : `Look link copied for ${friend?.name || "your friend"}`);
}

async function copyText(value, message) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(message);
  } catch {
    showToast(message.replace("copied", "ready"));
  }
}

function openAbout() {
  const names = [
    providers.avatar.label,
    providers.tryOn.label,
    providers.makeup.label,
    providers.background.label,
    providers.circle.label,
  ].join(" · ");
  openSheet(`
    <h2>About</h2>
    <p class="lede">WingsCrew Looks is a way to try an outfit on you, save it, and decide with a friend.</p>
    <div class="sheet-note">
      <p>Photos in this prototype stay in this browser. A demo share link never leaves this phone. A live share link uploads that one look image.</p>
      <p style="margin-top:8px">Every dressed image is marked AI preview. It is not a real fitting.</p>
      <p style="margin-top:8px">${isTeen(state.profile) ? "Teen mode is on. Sharing is invite-only. There is no public profile and no search. Phone-contact matching comes with the native app." : "Ages 13 to 17 use Teen mode. Under 13 is not stored."}</p>
      <p style="margin-top:8px">Active previews: ${escapeHtml(names)}.</p>
    </div>
    <div class="stack" style="margin-top:14px">
      <button type="button" class="btn ghost full" data-action="delete-photos">Delete my photos</button>
      <button type="button" class="btn rose full" data-action="delete-all">Delete everything on this device</button>
      <a class="btn ghost full" style="text-align:center;text-decoration:none" href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
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
