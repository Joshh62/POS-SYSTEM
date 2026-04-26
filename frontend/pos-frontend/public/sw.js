/**
 * Service Worker — POS System
 * Strategy:
 *  - App shell (HTML, JS, CSS) → Network First (fresh updates), fallback to cache
 *  - API calls               → Network First with offline fallback
 *  - Failed sales            → Queue for sync when back online
 *
 * ✅ IMPORTANT: Bump CACHE_VERSION every time you deploy a new build.
 *    This forces the SW to activate immediately and serve fresh files.
 *    Change: "pos-v1" → "pos-v2" → "pos-v3" etc.
 */

const CACHE_VERSION = "pos-v2";           // ← bump this on every deploy
const CACHE_NAME    = CACHE_VERSION;
const OFFLINE_URL   = "/offline.html";

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
];

// ── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // ✅ skipWaiting ensures new SW activates immediately without waiting for
  //    old tabs to close — critical for seeing updates after a deploy
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)   // delete all old cache versions
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

  // ── API calls (Render backend) → Network First ──────────────────────────
  const isApiCall =
    url.hostname.includes("onrender.com") ||
    url.hostname === "127.0.0.1" ||
    url.pathname.startsWith("/api");

  if (isApiCall) {
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
            return new Response(
              JSON.stringify({ error: "offline", message: "No internet connection." }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            );
          })
        )
    );
    return;
  }

  // ── Static assets (JS, CSS, HTML) → Network First ───────────────────────
  // ✅ Changed from Cache First to Network First so deploys show immediately.
  //    If network fails (offline), fall back to cache so app still works.
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
          // Final fallback for navigation requests
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
    event.waitUntil(syncPendingSales());
  }
});

async function syncPendingSales() {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: "SYNC_STARTED" }));
}

// ── PUSH NOTIFICATIONS (future) ───────────────────────────────────────────────
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