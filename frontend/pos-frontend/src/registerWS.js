/**
 * registerSW.js
 * Register the service worker and handle updates.
 * Import this in main.jsx
 */
import { registerSyncListener } from "./utils/offlineQueue";
import { createSale } from "./api/api";

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
            // New version available — dispatch event for UI to show reload prompt
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