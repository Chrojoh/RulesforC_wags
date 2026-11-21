// C-WAGS Rules Reference — offline application cache
const CACHE_NAME = "cwags-rules-offline-v2";
const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache the essential app shell. A failed optional asset must not
    // prevent the service worker from installing.
    await Promise.all(APP_FILES.map(async path => {
      try {
        const response = await fetch(new Request(path, { cache: "reload" }));
        if (response.ok) await cache.put(path, response);
      } catch (_) {
        // The page can still be used online; retry on a later visit.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("cwags-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const appOrigin = self.location.origin;
  if (url.origin !== appOrigin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(request, response.clone());
          return response;
        }
      } catch (_) {
        // Offline: serve the previously cached app.
      }
      return (await cache.match(request)) ||
        (await cache.match("./index.html")) ||
        (await cache.match("./")) ||
        new Response("C-WAGS Rules Reference is not available offline yet. Open it once while connected to the internet, then try again.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
