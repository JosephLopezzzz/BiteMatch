"use strict";

const appRoot = new URL("./", self.location.href);
const cachePrefix = "bitematch:" + appRoot.pathname + ":";
const cacheName = cachePrefix + "catalog-2";
const photoCacheName = cachePrefix + "photos-2";
const photoLimit = 24;
let photoWrites = Promise.resolve();
const shellFiles = [
  "./", "./index.html", "./styles.css", "./prototype.js", "./install.js", "./manifest.webmanifest",
  "./catalog/client.js", "./catalog/config.js", "./catalog/starter.json",
  "./assets/brand/bitematch-header.webp", "./assets/brand/icon-192.png", "./assets/brand/icon-512.png",
  "./assets/brand/icon-maskable-512.png", "./assets/brand/apple-touch-icon.png",
  "./assets/fonts/bricolage-grotesque.woff2", "./assets/food/turon.webp",
  ...["turon", "banana-chips", "mango", "potatoes", "rice"].flatMap(file =>
    [400, 800].map(width => `./assets/food/${file}-${width}.webp`))
].map(path => new URL(path, appRoot).href);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(shellFiles.map(url => new Request(url, { cache: "reload" })))));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) &&
      key !== cacheName && key !== photoCacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("Range")) return;
  const url = new URL(request.url);
  url.search = "";
  const isShell = shellFiles.includes(url.href);
  const dishPath = url.pathname.slice(appRoot.pathname.length);
  const isDishPhoto = url.origin === appRoot.origin && url.pathname.startsWith(appRoot.pathname) &&
    /^assets\/food\/[a-z0-9-]+-(400|800)\.webp$/.test(dishPath);
  if (!isShell && !isDishPhoto) return;

  event.respondWith((async () => {
    const cache = await caches.open(isShell ? cacheName : photoCacheName);
    if (!isShell) {
      const saved = await cache.match(url.href);
      if (saved) return saved;
    }
    try {
      const response = await fetch(request);
      if (response.ok && isShell) await cache.put(url.href, response.clone()).catch(() => {});
      if (response.ok && !isShell) {
        const copy = response.clone();
        photoWrites = photoWrites.then(async () => {
          await cache.put(url.href, copy);
          const keys = await cache.keys();
          await Promise.all(keys.slice(0, Math.max(0, keys.length - photoLimit)).map(key => cache.delete(key)));
        }).catch(() => {});
        await photoWrites;
      }
      if (response.status >= 500) return await cache.match(url.href) || response;
      return response;
    } catch (error) {
      const saved = await cache.match(url.href);
      if (saved) return saved;
      throw error;
    }
  })());
});
