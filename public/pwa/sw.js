// The settlement's offline keeper. Served from the root as /sw.js so its
// scope covers every player surface.
//
// Contract:
//  - Player surfaces stay fresh online (network first) and readable offline
//    (last good copy from the cache).
//  - GM surfaces (/gm, /board, /music, /screen, /cartography) and anything
//    mutating are never intercepted — the worker only ever touches GET.
//  - /api/stream (SSE) passes straight through, always.
//  - Only whitelisted player API reads are snapshotted; nothing here widens
//    what the server already decided a player may see.
//
// Bump VERSION after breaking shell changes to discard every cached file.

const VERSION = "v1";
const SHELL = `settlement-shell-${VERSION}`;
const DATA = `settlement-data-${VERSION}`;

// Entry pages precached at install so the app opens with the server away.
const ENTRY_PAGES = [
  "/login/", "/player/", "/table/", "/table-book/", "/tome/",
  "/journal/", "/character/", "/create/", "/background/", "/rules/",
  "/manifest.webmanifest"
];

// Static prefixes the worker manages. GM prefixes are deliberately absent.
const STATIC_PREFIXES = [
  "/shared/", "/pwa/", "/vendor/", "/generated/",
  "/login", "/player", "/table", "/table-book", "/tome",
  "/journal", "/character", "/create", "/background", "/rules"
];

// Player API reads worth keeping as offline snapshots (matched on pathname;
// the query string stays part of the cache key, so ?pc= snapshots are per-PC).
const API_EXACT = [
  "/api/table", "/api/lore", "/api/rules", "/api/reference",
  "/api/party", "/api/messages", "/api/items/consumables"
];
const API_PREFIXES = ["/api/journal-doodles/"];

// Dynamic routes that serve a static page: offline navigation falls back here.
const NAV_FALLBACKS = [
  ["/character/", "/character/"],
  ["/background/", "/background/"]
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(ENTRY_PAGES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isSnapshotApi = (path) =>
  API_EXACT.includes(path) || API_PREFIXES.some((p) => path.startsWith(p));

const isManagedStatic = (path) =>
  path === "/manifest.webmanifest" || STATIC_PREFIXES.some((p) => path.startsWith(p));

// Network first; a good response refreshes the cache, failure serves the
// last good copy. Navigations additionally fall back to their entry page.
async function networkFirst(request, cacheName, navFallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    if (navFallback) {
      const fallback = await cache.match(navFallback);
      if (fallback) return fallback;
    }
    throw err;
  }
}

// Images: last copy immediately, refresh quietly behind it.
async function cachedImage(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request, { ignoreVary: true });
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (path === "/api/stream") return; // SSE: never touch
  if (path.startsWith("/api/")) {
    if (isSnapshotApi(path)) event.respondWith(networkFirst(request, DATA));
    return;
  }
  // Audio/video use range requests the Cache API can't serve; pass through.
  if (request.destination === "audio" || request.destination === "video") return;

  if (request.mode === "navigate") {
    if (path === "/") return; // the bare address stays a live redirect to /login
    if (!isManagedStatic(path)) return;
    const entry = ENTRY_PAGES.find((p) => path === p || `${path}/` === p);
    const dynamic = NAV_FALLBACKS.find(([prefix]) => path.startsWith(prefix));
    event.respondWith(networkFirst(request, SHELL, entry || (dynamic && dynamic[1])));
    return;
  }

  if (!isManagedStatic(path)) return;
  if (request.destination === "image") {
    event.respondWith(cachedImage(request));
    return;
  }
  event.respondWith(networkFirst(request, SHELL));
});
