// src/components/OfflineIndicator.jsx
//
// Shows a banner when the user is offline or has pending sales to sync.
// Mounts once in POSLayout — visible across all pages.
// Listens to browser online/offline events and queue sync events.

import { useState, useEffect } from "react";
import { getPendingCount, syncQueue } from "../utils/offlineQueue";
import { createSale } from "../api/api";

export default function OfflineIndicator() {
  const [isOnline,  setIsOnline]  = useState(navigator.onLine);
  const [pending,   setPending]   = useState(getPendingCount());
  const [syncing,   setSyncing]   = useState(false);
  const [lastSync,  setLastSync]  = useState(null); // { synced, remaining }

  useEffect(() => {
    const handleOnline  = () => { setIsOnline(true);  setPending(getPendingCount()); };
    const handleOffline = () => { setIsOnline(false); setPending(getPendingCount()); };

    const handleSyncStart = () => {
      setSyncing(true);
      setLastSync(null);
    };

    const handleSynced = (e) => {
      setSyncing(false);
      setPending(e.detail.remaining);
      setLastSync(e.detail);
      // Clear success message after 4 seconds
      setTimeout(() => setLastSync(null), 4000);
    };

    window.addEventListener("online",                handleOnline);
    window.addEventListener("offline",               handleOffline);
    window.addEventListener("pos-queue-sync-start",  handleSyncStart);
    window.addEventListener("pos-queue-synced",      handleSynced);

    return () => {
      window.removeEventListener("online",               handleOnline);
      window.removeEventListener("offline",              handleOffline);
      window.removeEventListener("pos-queue-sync-start", handleSyncStart);
      window.removeEventListener("pos-queue-synced",     handleSynced);
    };
  }, []);

  const handleManualSync = async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    await syncQueue(createSale);
    setSyncing(false);
    setPending(getPendingCount());
  };

  // Nothing to show — online with no pending
  if (isOnline && pending === 0 && !lastSync) return null;

  // ── Offline banner ────────────────────────────────────────────────────────
  if (!isOnline) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#854F0B",
        color: "#fff",
        padding: "8px 20px",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 8888,
        boxShadow: "0 -2px 12px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📡</span>
          <span>
            You are offline — sales are being saved locally
            {pending > 0 && ` (${pending} pending)`}
          </span>
        </div>
        <span style={{ fontSize: 11, opacity: 0.8 }}>Will sync automatically when reconnected</span>
      </div>
    );
  }

  // ── Syncing banner ────────────────────────────────────────────────────────
  if (syncing) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#185FA5",
        color: "#fff",
        padding: "8px 20px",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 8,
        zIndex: 8888,
      }}>
        <span style={{ fontSize: 14 }}>🔄</span>
        Syncing offline sales to server...
      </div>
    );
  }

  // ── Sync success banner ───────────────────────────────────────────────────
  if (lastSync && lastSync.synced > 0) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#3B6D11",
        color: "#fff",
        padding: "8px 20px",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 8,
        zIndex: 8888,
      }}>
        <span style={{ fontSize: 14 }}>✅</span>
        {lastSync.synced} offline sale{lastSync.synced !== 1 ? "s" : ""} synced successfully
      </div>
    );
  }

  // ── Pending sales banner (online but queue not empty) ─────────────────────
  if (pending > 0 && isOnline) {
    return (
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#FAEEDA",
        color: "#854F0B",
        padding: "8px 20px",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 8888,
        borderTop: "1px solid #e8c880",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          {pending} offline sale{pending !== 1 ? "s" : ""} waiting to sync
        </div>
        <button
          onClick={handleManualSync}
          style={{
            background: "#854F0B", color: "#fff",
            border: "none", borderRadius: 6,
            padding: "4px 12px", fontSize: 11,
            fontWeight: 500, cursor: "pointer",
          }}
        >
          Sync now
        </button>
      </div>
    );
  }

  return null;
}