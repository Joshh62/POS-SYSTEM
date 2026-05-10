import { useState, useEffect } from "react";

const AMBER = "#C8820A";

/**
 * PWAInstallBanner
 * ─────────────────
 * Handles PWA install across all platforms:
 *
 * Android Chrome  → captures beforeinstallprompt, shows "Install app" button
 * iOS Safari      → detects iOS, shows "Add to Home Screen" step-by-step guide
 * Desktop Chrome  → shows install button using beforeinstallprompt
 * Already installed → hides itself (display-mode: standalone)
 *
 * Usage: <PWAInstallBanner />  — drop anywhere on the landing page
 */
export default function PWAInstallBanner({ inline = false }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isIOS,         setIsIOS]         = useState(false);
  const [isInstalled,   setIsInstalled]   = useState(false);
  const [showIOSGuide,  setShowIOSGuide]  = useState(false);
  const [installed,     setInstalled]     = useState(false); // just installed

  useEffect(() => {
    // Already running as installed PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // iOS detection
    const ua  = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
    setIsIOS(ios);

    // Android / Desktop Chrome — capture install prompt
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Listen for successful install
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setInstallPrompt(null);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  // Already installed — show nothing
  if (isInstalled) return null;

  // Just installed successfully
  if (installed) {
    return (
      <div style={installed ? successStyle : null}>
        <span style={{ fontSize: 20 }}>🎉</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>ProfitTrack installed! Open it from your home screen.</span>
      </div>
    );
  }

  // ── iOS Safari — manual instructions ────────────────────────────────────
  if (isIOS) {
    return (
      <div style={inline ? inlineWrap : bannerWrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 28 }}>📱</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
              Install ProfitTrack on your iPhone
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              Works like a native app — no App Store needed
            </div>
          </div>
          <button onClick={() => setShowIOSGuide(g => !g)}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: AMBER, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            {showIOSGuide ? "Hide guide" : "How to install →"}
          </button>
        </div>

        {showIOSGuide && (
          <div style={{ marginTop: 16, background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              3 steps to install
            </div>
            {[
              { n: "1", icon: "⬆️", text: 'Tap the Share button at the bottom of your Safari browser (the box with an arrow pointing up)' },
              { n: "2", icon: "➕", text: 'Scroll down and tap "Add to Home Screen"' },
              { n: "3", icon: "✅", text: 'Tap "Add" in the top right — ProfitTrack appears on your home screen' },
            ].map(s => (
              <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: AMBER, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#fff" }}>{s.n}</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
                  <span style={{ marginRight: 6 }}>{s.icon}</span>{s.text}
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
              Only works in Safari. If you're in Chrome on iPhone, open this page in Safari first.
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Android / Desktop Chrome — native install prompt ────────────────────
  if (installPrompt) {
    return (
      <div style={inline ? inlineWrap : bannerWrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 28 }}>📲</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
              Install ProfitTrack on your device
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              Works offline · No App Store · Home screen icon
            </div>
          </div>
          <button onClick={handleInstall}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: AMBER, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(200,130,10,0.4)" }}>
            ⬇ Install app
          </button>
        </div>
      </div>
    );
  }

  // No prompt available yet (desktop non-Chrome, etc.) — show generic guide
  if (inline) {
    return (
      <div style={inlineWrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 28 }}>💻</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 2 }}>Install ProfitTrack</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              On Chrome: tap the install icon (⬇) in the address bar · On iPhone: tap Share → Add to Home Screen
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

const bannerWrap = {
  background: "#1a1a1a",
  border: `1px solid rgba(200,130,10,0.3)`,
  borderRadius: 14,
  padding: "16px 20px",
  marginBottom: 16,
};

const inlineWrap = {
  background: "#1a1a1a",
  border: `1px solid rgba(200,130,10,0.3)`,
  borderRadius: 14,
  padding: "16px 20px",
};

const successStyle = {
  display: "flex", alignItems: "center", gap: 10,
  background: "#EAF3DE", borderRadius: 10,
  padding: "12px 16px", fontSize: 14, color: "#3B6D11",
};