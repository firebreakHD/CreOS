const CACHE = "creatoros-shell-v1";
const base = self.location.pathname.replace(/\/service-worker\.js$/, "").replace(/\/$/, "");
const appPath = (path) => `${base}${path}` || "/";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([appPath("/"), appPath("/icon.svg"), appPath("/manifest.webmanifest")])));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("creatoros-shell-") && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isApi = url.pathname.includes("/api/");
  if (request.method !== "GET" || url.origin !== self.location.origin || isApi) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match(appPath("/")))));
  }
});
