/**
 * PWAStatusBar
 * Shows offline warning, pending sync count, and install button.
 * Sits just below the topbar, only visible when relevant.
 */
import { usePWA } from "../../hooks/usePWA";

export default function PWAStatusBar() {
  const { isOnline, pendingCount, installPrompt, promptInstall } = usePWA();

  // Nothing to show if online, no pending, no install prompt
  if (isOnline && pendingCount === 0 && !installPrompt) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 8,
      padding: "6px 20px",
      flexShrink: 0,
      background: !isOnline ? "#FAEEDA" : pendingCount > 0 ? "#E6F1FB" : "#EAF3DE",
      borderBottom: "1px solid var(--color-border-tertiary)",
    }}>

      {/* Offline warning */}
      {!isOnline && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#854F0B", fontWeight: 500 }}>
          <span>📡</span>
          <span>You're offline — sales will be queued and synced when you reconnect</span>
        </div>
      )}

      {/* Pending sync notice */}
      {isOnline && pendingCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#185FA5", fontWeight: 500 }}>
          <span>🔄</span>
          <span>Syncing {pendingCount} offline sale{pendingCount !== 1 ? "s" : ""}...</span>
        </div>
      )}

      {/* Back online confirmation */}
      {isOnline && pendingCount === 0 && !installPrompt && null}

      {/* Install button */}
      {installPrompt && (
        <button
          onClick={promptInstall}
          style={{
            marginLeft: "auto",
            padding: "4px 14px",
            borderRadius: 8,
            border: "none",
            background: "#185FA5",
            color: "#E6F1FB",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          📲 Install app
        </button>
      )}
    </div>
  );
}