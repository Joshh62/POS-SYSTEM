/**
 * Service Worker — ProfitTrack POS
 * Strategy:
 *  - App shell (HTML, JS, CSS) → Network First, fallback to cache
 *  - Product API calls         → Network First, cache response for offline use
 *  - Other API calls           → Network First, no cache (sensitive data)
 *  - Failed sales              → Queued in localStorage, synced via background sync
 *
 * ✅ IMPORTANT: Bump CACHE_VERSION on every deploy.
 */

const CACHE_VERSION = "pos-v3";
const CACHE_NAME    = CACHE_VERSION;
const OFFLINE_URL   = "/offline.html";

// API endpoints whose responses are safe to cache for offline use
const CACHEABLE_API_PATHS = [
  "/products/",
  "/categories/",
];

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
];

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  const isApiCall =
    url.hostname.includes("onrender.com") ||
    url.hostname === "127.0.0.1" ||
    url.pathname.startsWith("/api");

  if (isApiCall) {
    // Check if this is a cacheable API path (products, categories)
    const isCacheable = CACHEABLE_API_PATHS.some(p => url.pathname.startsWith(p));

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && isCacheable) {
            // Cache products and categories for offline access
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({ error: "offline", message: "No internet connection." }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          })
        )
    );
    return;
  }

  // Static assets — Network First with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match(OFFLINE_URL);
          }
        })
      )
  );
});

// ── BACKGROUND SYNC ───────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-sales") {
    event.waitUntil(syncPendingSalesFromSW());
  }
});

async function syncPendingSalesFromSW() {
  // Notify all open clients to run the sync
  // The actual sync logic lives in offlineQueue.js (has access to auth token)
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((client) =>
    client.postMessage({ type: "SW_SYNC_REQUESTED" })
  );
}

// ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || "ProfitTrack POS", {
      body:  data.body || "",
      icon:  "/favicon.svg",
      badge: "/favicon.svg",
    })
  );
});

// ── MESSAGE HANDLER ───────────────────────────────────────────────────────────
// Allows the app to send messages to the SW (e.g. skip waiting)
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});