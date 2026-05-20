import { useState, useCallback, useEffect } from "react";
import ProductGrid from "../components/products/ProductGrid";
import Cart from "../components/cart/Cart";
import CartSummary from "../components/cart/CartSummary";
import CheckoutPanel from "../components/checkout/CheckoutPanel";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { useCart } from "../context/CartContext";
import { getProductByBarcode } from "../api/api";
import { getCachedProducts } from "../utils/offlineQueue";

export default function POS({ onScanResult }) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [showCart,     setShowCart]     = useState(false);
  const [isMobile,     setIsMobile]     = useState(window.innerWidth < 640);
  const { addToCart, cartItems } = useCart();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const totalItems = cartItems?.reduce((s, i) => s + (i.quantity || 1), 0) ?? 0;

  // ── Shared scan handler (USB scanner hook + search input Enter) ────────────
  const handleScan = useCallback(async (barcode) => {
    onScanResult?.(barcode);
    try {
      const product = await getProductByBarcode(barcode);
      addToCart(product);
      setScanFeedback({ type: "success", message: `Added: ${product.product_name}` });
    } catch {
      if (!navigator.onLine) {
        const cached  = getCachedProducts();
        const product = cached?.find(p => p.barcode === barcode);
        if (product) {
          addToCart(product);
          setScanFeedback({ type: "success", message: `Added: ${product.product_name} (offline)` });
        } else {
          setScanFeedback({ type: "error", message: `Product not found offline: ${barcode}` });
        }
      } else {
        setScanFeedback({ type: "error", message: `No product found for: ${barcode}` });
      }
    }
    setTimeout(() => setScanFeedback(null), 2500);
  }, [addToCart, onScanResult]);

  // ── Global USB/Bluetooth scanner hook ─────────────────────────────────────
  useBarcodeScanner(handleScan);

  // ── Search input Enter key → try barcode lookup first ─────────────────────
  // If the value matches a barcode: add to cart, clear field, reset grid.
  // If no barcode match: do nothing — name search results stay visible.
  const handleSearchKeyDown = useCallback(async (e) => {
    if (e.key !== "Enter") return;
    const val = e.target.value.trim();
    if (!val) return;
    try {
      const product = await getProductByBarcode(val);
      addToCart(product);
      setScanFeedback({ type: "success", message: `Added: ${product.product_name}` });
      e.target.value = "";
      window.dispatchEvent(new CustomEvent("pos-search", { detail: "" }));
    } catch {
      // Not a barcode match — leave search results showing
    }
    setTimeout(() => setScanFeedback(null), 2500);
  }, [addToCart]);

  // ── MOBILE LAYOUT ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

        {/* Tab toggle bar */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", flexShrink: 0 }}>
          <button onClick={() => setShowCart(false)} style={mobileTab(!showCart)}>
            🛍️ Products
          </button>
          <button onClick={() => setShowCart(true)} style={mobileTab(showCart)}>
            🛒 Cart
            {totalItems > 0 && (
              <span style={{ marginLeft: 6, background: "var(--color-primary)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 7px" }}>
                {totalItems}
              </span>
            )}
          </button>
        </div>

        {/* Products panel */}
        {!showCart && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-background-tertiary)" }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", flexShrink: 0 }}>
              <input
                type="text"
                placeholder={navigator.onLine ? "Search by name, or type barcode + Enter" : "🔴 Offline — showing cached products"}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                onChange={(e) => window.dispatchEvent(new CustomEvent("pos-search", { detail: e.target.value }))}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            {scanFeedback && (
              <div style={{ padding: "8px 12px", fontSize: 13, fontWeight: 500, background: scanFeedback.type === "success" ? "var(--success-bg)" : "var(--error-bg)", color: scanFeedback.type === "success" ? "var(--success-text)" : "var(--error-text)", borderBottom: "1px solid var(--color-border-tertiary)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                {scanFeedback.type === "success" ? "✓" : "✕"} {scanFeedback.message}
              </div>
            )}
            <div style={{ flex: 1, padding: 12, overflowY: "auto" }}>
              <ProductGrid externalSearch />
            </div>
            {totalItems > 0 && (
              <div style={{ padding: "10px 12px", borderTop: "1px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", flexShrink: 0 }}>
                <button onClick={() => setShowCart(true)} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  View cart ({totalItems} item{totalItems !== 1 ? "s" : ""}) →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Cart panel */}
        {showCart && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--color-background-primary)", overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-tertiary)", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Cart</span>
              {!navigator.onLine && (
                <span style={{ fontSize: 10, fontWeight: 500, background: "#FAEEDA", color: "#854F0B", padding: "2px 8px", borderRadius: 8 }}>OFFLINE</span>
              )}
            </div>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "8px 12px" }}>
              <Cart />
            </div>
            <div style={{ padding: "0 12px 16px", flexShrink: 0 }}>
              <CartSummary onCheckout={() => setShowCheckout(true)} />
            </div>
          </div>
        )}

        {showCheckout && (
          <CheckoutPanel onClose={() => setShowCheckout(false)} onSuccess={() => { setShowCheckout(false); setShowCart(false); }} />
        )}
      </div>
    );
  }

  // ── DESKTOP LAYOUT ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flex: 1, height: "100%", overflow: "hidden" }}>

      {/* Left — products */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--color-background-tertiary)" }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", flexShrink: 0 }}>
          <input
            type="text"
            placeholder={navigator.onLine ? "Search by name, or type barcode + Enter to add" : "🔴 Offline — showing cached products"}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            onChange={(e) => window.dispatchEvent(new CustomEvent("pos-search", { detail: e.target.value }))}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        {scanFeedback && (
          <div style={{ padding: "8px 16px", fontSize: 13, fontWeight: 500, background: scanFeedback.type === "success" ? "var(--success-bg)" : "var(--error-bg)", color: scanFeedback.type === "success" ? "var(--success-text)" : "var(--error-text)", borderBottom: "1px solid var(--color-border-tertiary)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span>{scanFeedback.type === "success" ? "✓" : "✕"}</span>
            {scanFeedback.message}
          </div>
        )}
        <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          <ProductGrid externalSearch />
        </div>
      </div>

      <div style={{ width: 1, background: "var(--color-border-tertiary)", flexShrink: 0 }} />

      {/* Right — cart */}
      <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--color-background-primary)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-tertiary)", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Cart</span>
          {!navigator.onLine && (
            <span style={{ fontSize: 10, fontWeight: 500, background: "#FAEEDA", color: "#854F0B", padding: "2px 8px", borderRadius: 8 }}>OFFLINE</span>
          )}
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "8px 16px" }}>
          <Cart />
        </div>
        <div style={{ padding: "0 16px 16px", flexShrink: 0 }}>
          <CartSummary onCheckout={() => setShowCheckout(true)} />
        </div>
      </div>

      {showCheckout && (
        <CheckoutPanel onClose={() => setShowCheckout(false)} onSuccess={() => setShowCheckout(false)} />
      )}
    </div>
  );
}

const mobileTab = (active) => ({
  flex: 1,
  padding: "10px 0",
  border: "none",
  background: "none",
  fontSize: 13,
  fontWeight: active ? 600 : 400,
  color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
  borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
});