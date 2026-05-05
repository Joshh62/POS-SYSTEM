// src/components/SplashScreen.jsx
//
// Three exports:
//   default SplashScreen   — full-page splash on initial app load
//   ProfitTrackIcon        — reusable icon SVG at any size
//   PageLoader             — inline centered spinner for within-page loading states

// ── Keyframes injected once ───────────────────────────────────────────────────
const STYLES = `
  @keyframes pt-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes pt-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.72; transform: scale(0.95); }
  }
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const tag = document.createElement("style");
  tag.textContent = STYLES;
  document.head.appendChild(tag);
  stylesInjected = true;
}

// ── Reusable icon ─────────────────────────────────────────────────────────────
export function ProfitTrackIcon({ size = 40 }) {
  // Use dark accent in dark mode, light accent in light mode
  // Read from html attribute set by ThemeContext
  const mode = document.documentElement.getAttribute("data-mode") || "light";
  const fill  = mode === "dark" ? "#e8903a" : "#b8640a";

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill={fill} />
      <path d="M22 18h12c4.4 0 7 2.6 7 6.5S38.4 31 34 31h-5v11h-7V18z" fill="white" />
      <path
        d="M18 48l8-7 7 5 11-10"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="46" cy="36" r="2" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

// ── Spinning ring around icon ─────────────────────────────────────────────────
function SpinRing({ size = 88, ringSize = 40 }) {
  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      style={{ position: "absolute", inset: 0, animation: "pt-spin 1.1s linear infinite" }}
    >
      <circle
        cx={size / 2} cy={size / 2} r={ringSize}
        stroke="var(--color-primary)"
        strokeWidth="2"
        opacity="0.12"
      />
      <circle
        cx={size / 2} cy={size / 2} r={ringSize}
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeDasharray="60 192"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// ── Full-page splash ──────────────────────────────────────────────────────────
export default function SplashScreen() {
  injectStyles();

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--color-background-tertiary)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 22,
      zIndex: 99999,
    }}>

      {/* Icon + ring container */}
      <div style={{ position: "relative", width: 88, height: 88 }}>
        <div style={{
          position: "absolute",
          top: 8, left: 8,
          animation: "pt-pulse 1.8s ease-in-out infinite",
        }}>
          <ProfitTrackIcon size={72} />
        </div>
        <SpinRing size={88} ringSize={40} />
      </div>

      {/* Brand text */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 16,
          fontWeight: 500,
          color: "var(--color-text-primary)",
          letterSpacing: "0.02em",
        }}>
          ProfitTrack POS
        </div>
        <div style={{
          fontSize: 12,
          color: "var(--color-text-tertiary)",
          marginTop: 4,
          letterSpacing: "0.04em",
        }}>
          Loading your workspace...
        </div>
      </div>
    </div>
  );
}

// ── Inline page loader ────────────────────────────────────────────────────────
// Drop-in replacement for "Loading..." text in any page component.
// Usage: replace   {loading && <div>Loading...</div>}
//        with      {loading && <PageLoader />}
export function PageLoader({ label = "Loading..." }) {
  injectStyles();

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      padding: 40,
      minHeight: 200,
    }}>
      {/* Smaller icon + ring */}
      <div style={{ position: "relative", width: 64, height: 64 }}>
        <div style={{
          position: "absolute",
          top: 6, left: 6,
          animation: "pt-pulse 1.8s ease-in-out infinite",
        }}>
          <ProfitTrackIcon size={52} />
        </div>
        <SpinRing size={64} ringSize={29} />
      </div>

      <div style={{
        fontSize: 13,
        color: "var(--color-text-tertiary)",
        letterSpacing: "0.03em",
      }}>
        {label}
      </div>
    </div>
  );
}