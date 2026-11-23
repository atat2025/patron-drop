/* Shell-only service worker: caches the app shell and static assets. Does not cache API, RPC, or wallet traffic. */
const CACHE = "patron-shell-v1";
const SHELL = ["/perp/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icon.svg", "/apple-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const shellish = url.pathname.startsWith("/_next/") || SHELL.includes(url.pathname) || url.pathname.startsWith("/icons/") || url.pathname === "/perp/" || url.pathname.endsWith("/perp/");
  if (!shellish) return;
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
