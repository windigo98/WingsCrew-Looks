const CACHE = "wingscrew-looks-v14";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css?v=11",
  "./js/app.js?v=14",
  "./js/hair.js?v=3",
  "./js/face-fit.js?v=1",
  "./assets/favicon.svg",
  "./assets/hair/afro.webp",
  "./assets/hair/beach-waves.webp",
  "./assets/hair/bob.webp",
  "./assets/hair/braids.webp",
  "./assets/hair/crop.webp",
  "./assets/hair/curls.webp",
  "./assets/hair/high-bun.webp",
  "./assets/hair/high-top-fade.webp",
  "./assets/hair/lob.webp",
  "./assets/hair/locs.webp",
  "./assets/hair/long-layers.webp",
  "./assets/hair/pixie.webp",
  "./assets/hair/shag.webp",
  "./assets/hair/silk-press.webp",
  "./assets/hair/taper.webp",
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
];

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
