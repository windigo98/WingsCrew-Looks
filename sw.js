const CACHE = "wingscrew-looks-v12";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css?v=9",
  "./js/app.js?v=12",
  "./js/hair.js?v=1",
  "./assets/favicon.svg",
  "./assets/hair/pixie.svg",
  "./assets/hair/bob.svg",
  "./assets/hair/long-straight.svg",
  "./assets/hair/long-waves.svg",
  "./assets/hair/curls.svg",
  "./assets/hair/braids.svg",
  "./assets/hair/fade.svg",
  "./assets/hair/bun.svg",
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
