/**
 * BarcodeScannerIndicator
 *
 * Small status pill shown in the topbar.
 * Flashes green when a scan is detected.
 * Shows the last scanned code for 2 seconds.
 */
import { useState, useEffect } from "react";

export default function BarcodeScannerIndicator({ lastScan }) {
  const [flash, setFlash] = useState(false);
  const [display, setDisplay] = useState(null);

  useEffect(() => {
    if (!lastScan) return;
    setFlash(true);
    setDisplay(lastScan);
    const t1 = setTimeout(() => setFlash(false), 600);
    const t2 = setTimeout(() => setDisplay(null), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [lastScan]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 10px",
      borderRadius: 20,
      border: `1px solid ${flash ? "#3B6D11" : "var(--color-border-tertiary)"}`,
      background: flash ? "#EAF3DE" : "transparent",
      transition: "all 0.2s ease",
      fontSize: 11,
      color: flash ? "#3B6D11" : "var(--color-text-tertiary)",
    }}>
      {/* Scanner icon */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
        stroke={flash ? "#3B6D11" : "currentColor"} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="6" y1="4" x2="6" y2="8"/>
        <line x1="10" y1="2" x2="10" y2="8"/>
        <line x1="14" y1="4" x2="14" y2="8"/>
        <line x1="18" y1="2" x2="18" y2="8"/>
        <line x1="6" y1="16" x2="6" y2="20"/>
        <line x1="10" y1="16" x2="10" y2="22"/>
        <line x1="14" y1="16" x2="14" y2="20"/>
        <line x1="18" y1="16" x2="18" y2="22"/>
      </svg>

      {display ? (
        <span style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}>{display}</span>
      ) : (
        <span>Scanner ready</span>
      )}
    </div>
  );
}