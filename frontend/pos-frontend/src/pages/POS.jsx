import { useState, useCallback } from "react";
import ProductGrid from "../components/products/ProductGrid";
import Cart from "../components/cart/Cart";
import CartSummary from "../components/cart/CartSummary";
import CheckoutPanel from "../components/checkout/CheckoutPanel";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { useCart } from "../context/CartContext";
import { getProductByBarcode } from "../api/api";

export default function POS({ onScanResult }) {
  const [showCheckout, setShowCheckout] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null); // { type: "success"|"error", message }
  const { addToCart } = useCart();

  const handleScan = useCallback(async (barcode) => {
    // Notify parent (App) so topbar indicator flashes
    onScanResult?.(barcode);

    try {
      const product = await getProductByBarcode(barcode);
      addToCart(product);
      setScanFeedback({ type: "success", message: `Added: ${product.product_name}` });
    } catch {
      setScanFeedback({ type: "error", message: `No product found for: ${barcode}` });
    }

    // Clear feedback after 2.5s
    setTimeout(() => setScanFeedback(null), 2500);
  }, [addToCart, onScanResult]);

  useBarcodeScanner(handleScan);

  return (
    <div style={{ display: "flex", flex: 1, height: "100%", overflow: "hidden" }}>

      {/* Left — products */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        overflow: "hidden", background: "var(--color-background-tertiary)",
      }}>
        {/* Search bar */}
        <div style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--color-border-tertiary)",
          background: "var(--color-background-primary)",
          flexShrink: 0,
        }}>
          <input
            type="text"
            placeholder="Search products... (or scan a barcode)"
            style={{
              width: "100%", padding: "7px 12px", borderRadius: 8,
              border: "1px solid var(--color-border-secondary)",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-primary)", fontSize: 13,
              outline: "none", boxSizing: "border-box",
            }}
            onChange={(e) => {
              window.dispatchEvent(new CustomEvent("pos-search", { detail: e.target.value }));
            }}
          />
        </div>

        {/* Scan feedback banner */}
        {scanFeedback && (
          <div style={{
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 500,
            background: scanFeedback.type === "success" ? "#EAF3DE" : "#FCEBEB",
            color: scanFeedback.type === "success" ? "#3B6D11" : "#A32D2D",
            borderBottom: "1px solid var(--color-border-tertiary)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span>{scanFeedback.type === "success" ? "✓" : "✕"}</span>
            {scanFeedback.message}
          </div>
        )}

        {/* Product grid */}
        <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          <ProductGrid externalSearch />
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: "var(--color-border-tertiary)", flexShrink: 0 }} />

      {/* Right — cart */}
      <div style={{
        width: 300, flexShrink: 0, display: "flex", flexDirection: "column",
        background: "var(--color-background-primary)", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border-tertiary)",
          fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", flexShrink: 0,
        }}>
          Cart
        </div>

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "8px 16px" }}>
          <Cart />
        </div>

        <div style={{ padding: "0 16px 16px", flexShrink: 0 }}>
          <CartSummary onCheckout={() => setShowCheckout(true)} />
        </div>
      </div>

      {showCheckout && (
        <CheckoutPanel
          onClose={() => setShowCheckout(false)}
          onSuccess={() => setShowCheckout(false)}
        />
      )}
    </div>
  );
}