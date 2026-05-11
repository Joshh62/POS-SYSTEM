/**
 * registerSW.js
 * Register the service worker and handle updates.
 * Also captures the beforeinstallprompt event early — before React renders —
 * so the PWA install banner can use it even if it mounts after the event fires.
 */
import { registerSyncListener } from "./utils/offlineQueue";
import { createSale }           from "./api/api";

// ── Capture install prompt IMMEDIATELY — before React mounts ─────────────────
// beforeinstallprompt fires very early. If we wait for a component to mount,
// we miss it. Store it globally so PWAInstallBanner can pick it up anytime.
window.__pwaInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
  // Also dispatch a custom event so mounted components know it arrived late
  window.dispatchEvent(new CustomEvent("pwa-install-ready", { detail: e }));
  console.log("[PWA] Install prompt captured");
});

window.addEventListener("appinstalled", () => {
  window.__pwaInstallPrompt = null;
  window.dispatchEvent(new CustomEvent("pwa-installed"));
  console.log("[PWA] App installed successfully");
});


export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.log("[SW] Service workers not supported");
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });

      console.log("[SW] Registered:", reg.scope);

      // Check for updates every 60 seconds
      setInterval(() => reg.update(), 60_000);

      // When new SW is available, notify user
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker?.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent("sw-update-available"));
          }
        });
      });

    } catch (err) {
      console.error("[SW] Registration failed:", err);
    }

    // Register offline sales sync listener
    registerSyncListener(createSale);
  });
}