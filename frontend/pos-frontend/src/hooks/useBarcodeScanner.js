import { useEffect, useRef, useCallback } from "react";

/**
 * useBarcodeScanner
 *
 * Listens globally for USB barcode scanner input.
 * USB scanners type characters very fast (< 50ms between keystrokes)
 * and always end with an Enter keypress.
 *
 * @param {function} onScan - called with the scanned barcode string
 * @param {object}   options
 *   @param {number}  options.minLength    - minimum barcode length to trigger (default: 3)
 *   @param {number}  options.maxGap       - max ms between keystrokes to count as scanner (default: 50)
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
      // Ignore keypresses inside text inputs / textareas / selects
      // so the scanner doesn't interfere with manual typing
      const tag = e.target.tagName.toLowerCase();
      const isEditable = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;

      const now = Date.now();
      const gap = now - lastKey.current;
      lastKey.current = now;

      if (e.key === "Enter") {
        // Scanner finished — flush regardless of where focus is
        if (buffer.current.length >= minLength) {
          e.preventDefault(); // don't submit forms
          flush();
        }
        return;
      }

      // Only accumulate if keystrokes are fast (scanner-speed) OR
      // the target is not an editable field
      if (!isEditable || gap < maxGap) {
        if (e.key.length === 1) {
          // Clear buffer if gap is too long (user paused — reset)
          if (gap > maxGap && buffer.current.length > 0 && isEditable) {
            buffer.current = "";
          }
          buffer.current += e.key;

          // Auto-reset buffer after 500ms of no input
          clearTimeout(timeoutId.current);
          timeoutId.current = setTimeout(() => {
            buffer.current = "";
          }, 500);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timeoutId.current);
    };
  }, [enabled, flush, maxGap, minLength]);
}