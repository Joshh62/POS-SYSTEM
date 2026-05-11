import { useState, useEffect } from "react";

const AMBER = "#C8820A";

/**
 * PWAInstallBanner
 * ─────────────────
 * Works with registerSW.js which captures beforeinstallprompt early
 * into window.__pwaInstallPrompt before React mounts.
 *
 * Platform handling:
 * - Android Chrome  → native install button via stored prompt
 * - iOS Safari      → manual "Add to Home Screen" guide
 * - Desktop Chrome  → native install button
 * - Already installed (standalone mode) → hidden
 */
export default function PWAInstallBanner({ inline = false }) {
  const [installPrompt, setInstallPrompt] = useState(() => window.__pwaInstallPrompt || null);
  const [isIOS,         setIsIOS]         = useState(false);
  const [isInstalled,   setIsInstalled]   = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const [showIOSGuide,  setShowIOSGuide]  = useState(false);

  useEffect(() => {
    // Already running as installed PWA
    if (window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }

    // iOS detection
    const ua  = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
    setIsIOS(ios);

    // Pick up prompt if already captured before we mounted
    if (window.__pwaInstallPrompt) {
      setInstallPrompt(window.__pwaInstallPrompt);
    }

    // Also listen for late capture (prompt arrived after component mounted)
    const onReady = (e) => {
      setInstallPrompt(e.detail);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setInstallPrompt(null);
      window.__pwaInstallPrompt = null;
    };

    window.addEventListener("pwa-install-ready", onReady);
    window.addEventListener("pwa-installed",     onInstalled);
    window.addEventListener("appinstalled",      onInstalled);

    return () => {
      window.removeEventListener("pwa-install-ready", onReady);
      window.removeEventListener("pwa-installed",     onInstalled);
      window.removeEventListener("appinstalled",      onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setJustInstalled(true);
      setInstallPrompt(null);
      window.__pwaInstallPrompt = null;
    }
  };

  // Already running as PWA — show nothing
  if (isInstalled) return null;

  // Just installed
  if (justInstalled) {
    return (
      <div style={{ ...wrapStyle(inline), display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22 }}>🎉</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
          ProfitTrack installed! Open it from your home screen.
        </span>
      </div>
    );
  }

  // ── iOS Safari ────────────────────────────────────────────────────────────
  if (isIOS) {
    return (
      <div style={wrapStyle(inline)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 26 }}>📱</div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
              Install ProfitTrack on your iPhone
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              Works like a native app — no App Store needed
            </div>
          </div>
          <button onClick={() => setShowIOSGuide(g => !g)} style={installBtn}>
            {showIOSGuide ? "Hide guide" : "How to install →"}
          </button>
        </div>

        {showIOSGuide && (
          <div style={{ marginTop: 14, background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              3 steps to install
            </div>
            {[
              { n:"1", icon:"⬆️", text:'Tap the Share button at the bottom of Safari (the square with an arrow pointing up)' },
              { n:"2", icon:"➕", text:'Scroll down and tap "Add to Home Screen"' },
              { n:"3", icon:"✅", text:'Tap "Add" in the top right corner — ProfitTrack appears on your home screen' },
            ].map(s => (
              <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: AMBER, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{s.n}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
                  <span style={{ marginRight: 5 }}>{s.icon}</span>{s.text}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8, lineHeight: 1.5 }}>
              ⚠️ Only works in Safari. If you're using Chrome on iPhone, open profittrack.ng in Safari first.
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Android / Desktop Chrome — native prompt available ────────────────────
  if (installPrompt) {
    return (
      <div style={wrapStyle(inline)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 26 }}>📲</div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
              Install ProfitTrack on your device
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
              Works offline · Home screen icon · No App Store
            </div>
          </div>
          <button onClick={handleInstall} style={{ ...installBtn, boxShadow: "0 4px 14px rgba(200,130,10,0.35)" }}>
            ⬇ Install app
          </button>
        </div>
      </div>
    );
  }

  // ── Fallback — no prompt yet, show manual guide ───────────────────────────
  // This shows when Chrome hasn't fired the prompt yet (first visit, or
  // criteria not yet met). Give manual instructions.
  return (
    <div style={wrapStyle(inline)}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 26, flexShrink: 0 }}>📲</div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
            Install ProfitTrack on your device
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
              <strong style={{ color: "rgba(255,255,255,0.85)" }}>Android Chrome:</strong> Tap the menu (⋮) in the top right → tap <em>"Add to Home screen"</em> or <em>"Install app"</em>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
              <strong style={{ color: "rgba(255,255,255,0.85)" }}>iPhone Safari:</strong> Tap the Share button (⬆) → tap <em>"Add to Home Screen"</em> → tap <em>"Add"</em>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
              <strong style={{ color: "rgba(255,255,255,0.85)" }}>Desktop Chrome:</strong> Look for the install icon (⊕) in the address bar
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const wrapStyle = (inline) => ({
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(200,130,10,0.28)",
  borderRadius: 14,
  padding: "16px 18px",
  ...(inline ? {} : { marginBottom: 16 }),
});

const installBtn = {
  padding: "9px 18px", borderRadius: 8, border: "none",
  background: AMBER, color: "#fff", fontSize: 13,
  fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};