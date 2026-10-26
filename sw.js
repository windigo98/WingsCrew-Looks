const CACHE = "wingscrew-looks-v13";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css?v=10",
  "./js/app.js?v=13",
  "./js/hair.js?v=2",
  "./assets/favicon.svg",
  "./assets/hair/pixie.webp",
  "./assets/hair/bob.webp",
  "./assets/hair/long-layers.webp",
  "./assets/hair/beach-waves.webp",
  "./assets/hair/curls.webp",
  "./assets/hair/braids.webp",
  "./assets/hair/high-top-fade.webp",
  "./assets/hair/high-bun.webp",
  "./assets/hair/sample-face.svg",
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
