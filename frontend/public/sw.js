/* ZUG Arena service worker.
 *
 * Goal: make the installed app launch fast and survive a flaky connection.
 * It never caches the API (api.playzug.xyz), Solana RPC, Privy or any other
 * origin: chain state must always come from the network.
 *
 * - /_next/static/*, /audio/*, /brand/*: cache-first (build assets are
 *   content-hashed; audio and brand files change with a deploy, and the cache
 *   name below changes with each build, so stale copies are dropped).
 * - Page navigations: network-first, falling back to the last copy of that
 *   page, then to /offline.html.
 *
 * __BUILD_ID__ is replaced by scripts/stamp-sw.mjs after `next build`.
 */
const BUILD_ID = "__BUILD_ID__";
const CACHE = `zug-${BUILD_ID}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/brand/zug-icon-192.png", "/brand/zug-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/audio/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/favicon.ico"
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE);
  // Static export serves /play?id=… from play.html, so key pages by path.
  const url = new URL(request.url);
  const key = new Request(url.origin + url.pathname);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    return offline || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API, RPC, Privy, fonts: untouched
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});
