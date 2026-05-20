import { useEffect, useRef, useCallback } from "react";

/**
 * useBarcodeScanner
 *
 * Listens globally for USB barcode scanner input.
 * USB scanners type characters very fast (< 50ms between keystrokes)
 * and always end with an Enter keypress.
 *
 * Also supports manual barcode entry when focus is outside any input field —
 * type the barcode at any speed and press Enter to trigger a scan.
 *
 * @param {function} onScan - called with the scanned barcode string
 * @param {object}   options
 *   @param {number}  options.minLength    - minimum barcode length to trigger (default: 3)
 *   @param {number}  options.maxGap       - max ms between keystrokes to count as scanner input inside an editable field (default: 50)
 *   @param {boolean} options.enabled      - pause listening when false (default: true)
 */
export function useBarcodeScanner(onScan, { minLength = 3, maxGap = 50, enabled = true } = {}) {
  const buffer    = useRef("");
  const lastKey   = useRef(0);
  const timeoutId = useRef(null);

  const flush = useCallback(() => {
    const code = buffer.current.trim();
    buffer.current = "";
    if (code.length >= minLength) {
      onScan(code);
    }
  }, [minLength, onScan]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      const tag        = e.target.tagName.toLowerCase();
      const isEditable = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;

      const now = Date.now();
      const gap = now - lastKey.current;
      lastKey.current = now;

      if (e.key === "Enter") {
        // Scanner finished — flush regardless of where focus is
        if (buffer.current.length >= minLength) {
          e.preventDefault();
          flush();
        }
        return;
      }

      if (e.key.length !== 1) return; // ignore Shift, Ctrl, Alt, etc.

      if (isEditable) {
        // Inside an input: only accumulate if keystrokes are scanner-fast
        // This prevents manual typing in search/form fields from triggering scans
        if (gap < maxGap) {
          buffer.current += e.key;
          clearTimeout(timeoutId.current);
          timeoutId.current = setTimeout(() => { buffer.current = ""; }, 500);
        } else {
          // Too slow for a scanner — reset buffer (user is typing manually)
          buffer.current = "";
        }
      } else {
        // Outside any input: accumulate at any speed
        // This lets you manually type a barcode anywhere on the page and press Enter
        // Reset buffer if gap is very long (user paused/restarted)
        if (gap > 2000 && buffer.current.length > 0) {
          buffer.current = "";
        }
        buffer.current += e.key;
        clearTimeout(timeoutId.current);
        timeoutId.current = setTimeout(() => { buffer.current = ""; }, 2000);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timeoutId.current);
    };
  }, [enabled, flush, maxGap, minLength]);
}