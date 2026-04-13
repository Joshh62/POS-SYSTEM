/**
 * Service Worker — POS System
 * Strategy:
 *  - App shell (HTML, JS, CSS) → Cache First
 *  - API calls → Network First with offline fallback
 *  - Failed sales → Queue for sync when back online
 */

const CACHE_NAME    = "pos-v1";
const OFFLINE_URL   = "/offline.html";

// Files to cache immediately on install (app shell)
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
];

// ------------------------------------
// INSTALL — cache app shell
// ------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// ------------------------------------
// ACTIVATE — clean old caches
// ------------------------------------
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

// ------------------------------------
// FETCH — Network first for API,
//          Cache first for assets
// ------------------------------------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and browser-extension requests
  if (event.request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // API calls — Network first, fallback to offline response
  if (url.hostname === "127.0.0.1" || url.pathname.startsWith("/api")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful GET responses for offline fallback
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline — try cache
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            // Return a JSON offline response for API calls
            return new Response(
              JSON.stringify({ error: "offline", message: "No internet connection. Data may be outdated." }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          });
        })
    );
    return;
  }

  // Static assets — Cache first, then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL));
    })
  );
});

// ------------------------------------
// BACKGROUND SYNC
// Queued sales get synced when back online
// ------------------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-sales") {
    event.waitUntil(syncPendingSales());
  }
});

async function syncPendingSales() {
  // Signal to the app that sync is happening
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: "SYNC_STARTED" });
  });
}

// ------------------------------------
// PUSH NOTIFICATIONS (future use)
// ------------------------------------
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || "POS System", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    })
  );
});