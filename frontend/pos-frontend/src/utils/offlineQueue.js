/**
 * offlineQueue.js
 *
 * Stores failed/offline sales in localStorage.
 * Retries automatically when back online or when SW requests sync.
 * Notifies UI via custom events.
 *
 * FIX: Added isSyncing lock to prevent concurrent sync runs which caused
 * every offline sale to be submitted twice (once from the online event
 * listener and once from the SW_SYNC_REQUESTED message).
 */

const QUEUE_KEY    = "pos_offline_queue";
const PRODUCTS_KEY = "pos_cached_products";

// ── Sync lock — prevents concurrent sync runs ─────────────────────────────────
let isSyncing = false;

// ── Sale queue ────────────────────────────────────────────────────────────────

export function queueSale(salePayload) {
  const queue = getQueue();
  const entry = {
    id:        Date.now(),
    payload:   salePayload,
    queued_at: new Date().toISOString(),
    attempts:  0,
  };
  queue.push(entry);
  saveQueue(queue);
  console.log(`[OfflineQueue] Sale queued. Total pending: ${queue.length}`);

  // Request background sync if SW supports it
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.sync.register("sync-pending-sales").catch(() => {});
    });
  }

  return entry;
}

export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function getPendingCount() {
  return getQueue().length;
}

export async function syncQueue(createSaleFn) {
  // ── Lock: only one sync run at a time ────────────────────────────────────
  if (isSyncing) {
    console.log("[OfflineQueue] Sync already in progress — skipping duplicate trigger");
    return { synced: 0, remaining: getQueue().length };
  }

  const queue = getQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  isSyncing = true;
  console.log(`[OfflineQueue] Syncing ${queue.length} pending sale(s)...`);

  // Notify UI sync is starting
  window.dispatchEvent(new CustomEvent("pos-queue-sync-start", {
    detail: { total: queue.length }
  }));

  const remaining = [];
  let synced = 0;

  for (const entry of queue) {
    try {
      await createSaleFn(entry.payload);
      synced++;
      console.log(`[OfflineQueue] Sale ${entry.id} synced`);
    } catch (err) {
      entry.attempts += 1;
      if (entry.attempts < 5) {
        remaining.push(entry);
      } else {
        console.warn(`[OfflineQueue] Sale ${entry.id} dropped after 5 attempts`);
      }
    }
  }

  saveQueue(remaining);
  isSyncing = false;

  window.dispatchEvent(new CustomEvent("pos-queue-synced", {
    detail: { synced, remaining: remaining.length }
  }));

  console.log(`[OfflineQueue] Sync complete — ${synced} synced, ${remaining.length} remaining`);
  return { synced, remaining: remaining.length };
}

// ── Product cache for offline POS ─────────────────────────────────────────────

export function cacheProducts(products) {
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify({
      cached_at: new Date().toISOString(),
      data:      products,
    }));
  } catch (e) {
    console.warn("[OfflineQueue] Could not cache products:", e);
  }
}

export function getCachedProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (!raw) return null;
    const { data } = JSON.parse(raw);
    return data ?? null;
  } catch {
    return null;
  }
}

export function getCacheAge() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    if (!raw) return null;
    const { cached_at } = JSON.parse(raw);
    return Math.round((Date.now() - new Date(cached_at).getTime()) / 60000);
  } catch {
    return null;
  }
}

// ── Listeners ──────────────────────────────────────────────────────────────────
// Only register once — guards against multiple calls to registerSyncListener

let listenersRegistered = false;

export function registerSyncListener(createSaleFn) {
  if (listenersRegistered) {
    console.log("[OfflineQueue] Listeners already registered — skipping");
    return;
  }
  listenersRegistered = true;

  // Sync when browser comes back online
  window.addEventListener("online", () => {
    console.log("[OfflineQueue] Back online — syncing...");
    syncQueue(createSaleFn);
  });

  // Sync when SW sends SW_SYNC_REQUESTED message
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_SYNC_REQUESTED") {
        console.log("[OfflineQueue] SW requested sync");
        syncQueue(createSaleFn);
      }
    });
  }
}

// ── Internal ───────────────────────────────────────────────────────────────────

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}