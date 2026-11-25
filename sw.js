"use strict";

const appRoot = new URL("./", self.location.href);
const cachePrefix = "bitematch:" + appRoot.pathname + ":";
const cacheName = cachePrefix + "1";
const shellFiles = [
  "./", "./index.html", "./styles.css", "./prototype.js", "./install.js", "./manifest.webmanifest",
  "./assets/brand/bitematch-logo.png", "./assets/brand/icon-192.png", "./assets/brand/icon-512.png",
  "./assets/brand/icon-maskable-512.png", "./assets/brand/apple-touch-icon.png",
  "./assets/fonts/bricolage-grotesque.woff2", "./assets/food/turon.webp", "./assets/food/banana-chips.webp",
  "./assets/food/mango.webp", "./assets/food/potatoes.webp", "./assets/food/rice.webp"
].map(path => new URL(path, appRoot).href);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(shellFiles.map(url => new Request(url, { cache: "reload" })))));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("Range")) return;
  const url = new URL(request.url);
  url.search = "";
  if (!shellFiles.includes(url.href)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(url.href, response.clone()).catch(() => {});
      if (response.status >= 500) return await cache.match(url.href) || response;
      return response;
    } catch (error) {
      const saved = await cache.match(url.href);
      if (saved) return saved;
      throw error;
    }
  })());
});
