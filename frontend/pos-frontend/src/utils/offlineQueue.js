/**
 * offlineQueue.js
 *
 * Stores failed sales in localStorage when offline.
 * Retries them automatically when the app comes back online.
 * Notifies the UI via a custom event when sync completes.
 */

const QUEUE_KEY = "pos_offline_queue";

// ------------------------------------
// Save a failed sale to the queue
// ------------------------------------
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
  return entry;
}

// ------------------------------------
// Get all pending sales
// ------------------------------------
export function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

// ------------------------------------
// How many sales are pending
// ------------------------------------
export function getPendingCount() {
  return getQueue().length;
}

// ------------------------------------
// Attempt to sync all queued sales
// Called automatically when online event fires
// ------------------------------------
export async function syncQueue(createSaleFn) {
  const queue = getQueue();
  if (queue.length === 0) return;

  console.log(`[OfflineQueue] Syncing ${queue.length} pending sale(s)...`);

  const remaining = [];
  let synced = 0;

  for (const entry of queue) {
    try {
      await createSaleFn(entry.payload);
      synced++;
      console.log(`[OfflineQueue] Sale ${entry.id} synced successfully`);
    } catch (err) {
      entry.attempts += 1;
      // Drop after 5 failed attempts to prevent infinite loops
      if (entry.attempts < 5) {
        remaining.push(entry);
      } else {
        console.warn(`[OfflineQueue] Sale ${entry.id} dropped after 5 attempts`);
      }
    }
  }

  saveQueue(remaining);

  // Notify UI
  window.dispatchEvent(new CustomEvent("pos-queue-synced", {
    detail: { synced, remaining: remaining.length }
  }));

  return { synced, remaining: remaining.length };
}

// ------------------------------------
// Register online listener — auto-sync
// ------------------------------------
export function registerSyncListener(createSaleFn) {
  window.addEventListener("online", () => {
    console.log("[OfflineQueue] Back online — syncing...");
    syncQueue(createSaleFn);
  });
}

// ------------------------------------
// Internal helpers
// ------------------------------------
function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}