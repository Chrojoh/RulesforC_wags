// C-WAGS Rules Reference — standalone, offline-first app shell
const CACHE_NAME = "cwags-rules-offline-v4";
const APP_ROOT = new URL("./", self.registration.scope);
const APP_URL = new URL("index.html", APP_ROOT);
const OPTIONAL_FILES = [
  new URL("./", APP_ROOT).href,
  new URL("manifest.json", APP_ROOT).href,
  new URL("icon-192.png", APP_ROOT).href,
  new URL("icon-512.png", APP_ROOT).href
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // The rules and course-map data are embedded in index.html. Cache this
    // file first: an installation is not complete unless the full app shell
    // is safely stored for offline launch.
    const appResponse = await fetch(new Request(APP_URL.href, { cache: "reload" }));
    if (!appResponse.ok) throw new Error("Unable to cache the C-WAGS app shell.");
    await cache.put(APP_URL.href, appResponse);

    // These supporting files are useful but must not block app installation.
    await Promise.all(OPTIONAL_FILES.map(async url => {
      try {
        const response = await fetch(new Request(url, { cache: "reload" }));
        if (response.ok) await cache.put(url, response);
      } catch (_) {
        // Retry on a later online visit.
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("cwags-rules-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

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
        // Offline launch: use the saved app shell.
      }
      return (await cache.match(request)) ||
        (await cache.match(APP_URL.href)) ||
        new Response(
          "C-WAGS Rules has not finished its first online setup. Connect to the internet, open the app once, and try again.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
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
