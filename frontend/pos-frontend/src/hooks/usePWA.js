/**
 * usePWA.js
 * Handles PWA install prompt + online/offline status
 */
import { useState, useEffect } from "react";

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled]     = useState(false);
  const [isOnline, setIsOnline]           = useState(navigator.onLine);
  const [pendingCount, setPendingCount]   = useState(0);

  useEffect(() => {
    // Capture install prompt
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Detect if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    // Online/offline tracking
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    // Track pending queue count
    const updateCount = () => {
      try {
        const q = JSON.parse(localStorage.getItem("pos_offline_queue") || "[]");
        setPendingCount(q.length);
      } catch { setPendingCount(0); }
    };
    updateCount();
    window.addEventListener("pos-queue-synced", updateCount);
    window.addEventListener("storage", updateCount);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("pos-queue-synced", updateCount);
      window.removeEventListener("storage", updateCount);
    };
  }, []);

  const promptInstall = async () => {
    if (!installPrompt) return;
    const result = await installPrompt.prompt();
    if (result.outcome === "accepted") {
      setIsInstalled(true);
      setInstallPrompt(null);
    }
  };

  return { installPrompt, isInstalled, isOnline, pendingCount, promptInstall };
}