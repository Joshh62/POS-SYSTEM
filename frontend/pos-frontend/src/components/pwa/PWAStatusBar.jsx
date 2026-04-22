/**
 * PWAStatusBar
 * Shows offline warning, pending sync count, and install button.
 */
import { usePWA } from "../../hooks/usePWA";

export default function PWAStatusBar() {
  const { isOnline, pendingCount, installPrompt, promptInstall } = usePWA();

  if (isOnline && pendingCount === 0 && !installPrompt) return null;

  const bgColor = !isOnline
    ? "var(--color-warning-bg)"
    : pendingCount > 0
    ? "var(--color-primary-light)"
    : "var(--color-success-bg)";

  const textColor = !isOnline
    ? "var(--color-warning)"
    : pendingCount > 0
    ? "var(--color-primary)"
    : "var(--color-success)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
        padding: "6px 20px",
        flexShrink: 0,
        background: bgColor,
        borderBottom: "1px solid var(--color-border-tertiary)",
      }}
    >

      {/* Status message */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: textColor,
          fontWeight: 500,
        }}
      >
        {!isOnline && (
          <>
            <span>📡</span>
            <span>
              You're offline — sales will be saved and synced when reconnected
            </span>
          </>
        )}

        {isOnline && pendingCount > 0 && (
          <>
            <span>🔄</span>
            <span>
              Syncing {pendingCount} offline sale
              {pendingCount !== 1 ? "s" : ""}...
            </span>
          </>
        )}
      </div>

      {/* Install button */}
      {installPrompt && (
        <button
          onClick={promptInstall}
          style={{
            marginLeft: "auto",
            padding: "5px 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--color-primary)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.9)}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}
        >
          📲 Install app
        </button>
      )}
    </div>
  );
}