const CACHE = "wingscrew-looks-v16";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css?v=13",
  "./js/app.js?v=16",
  "./js/hair.js?v=16",
  "./js/face-fit.js?v=16",
  "./assets/favicon.svg",
  "./assets/hair/afro.webp",
  "./assets/hair/beach-waves.webp",
  "./assets/hair/blowout.webp",
  "./assets/hair/bob.webp",
  "./assets/hair/braids.webp",
  "./assets/hair/butterfly.webp",
  "./assets/hair/buzz.webp",
  "./assets/hair/comma.webp",
  "./assets/hair/cornrows.webp",
  "./assets/hair/crop.webp",
  "./assets/hair/curls.webp",
  "./assets/hair/curlytop.webp",
  "./assets/hair/flow.webp",
  "./assets/hair/high-bun.webp",
  "./assets/hair/high-top-fade.webp",
  "./assets/hair/lob.webp",
  "./assets/hair/locs.webp",
  "./assets/hair/long-layers.webp",
  "./assets/hair/mullet.webp",
  "./assets/hair/pixie.webp",
  "./assets/hair/ponytail.webp",
  "./assets/hair/shag.webp",
  "./assets/hair/silk-press.webp",
  "./assets/hair/softwolf.webp",
  "./assets/hair/taper.webp",
  "./assets/hair/twists.webp",
  "./assets/hair/twoblock.webp",
  "./assets/hair/waves360.webp",
  "./assets/hair/wolf.webp",
  "./assets/models/diamond-man.webp",
  "./assets/models/diamond-woman.webp",
  "./assets/models/heart-man.webp",
  "./assets/models/heart-woman.webp",
  "./assets/models/long-man.webp",
  "./assets/models/long-woman.webp",
  "./assets/models/oval-man.webp",
  "./assets/models/oval-woman.webp",
  "./assets/models/round-man.webp",
  "./assets/models/round-woman.webp",
  "./assets/models/square-man.webp",
  "./assets/models/square-woman.webp",
  "./assets/vendor/mediapipe/vision_bundle.mjs",
  "./assets/vendor/mediapipe/wasm/vision_wasm_internal.js",
  "./assets/vendor/mediapipe/wasm/vision_wasm_internal.wasm",
  "./assets/vendor/mediapipe/face_landmarker.task",
  "./assets/vendor/mediapipe/hair_segmenter.tflite",
];

/** Model portraits (assets/looks/) are not precached: each is cached the first time it's viewed. */
const LOOKS_PATH = "/assets/looks/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes(LOOKS_PATH)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })),
    );
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html"))),
  );
});
