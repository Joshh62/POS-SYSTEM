import { useState } from "react";
import ProductGrid from "../components/products/ProductGrid";
import Cart from "../components/cart/Cart";
import CartSummary from "../components/cart/CartSummary";
import CheckoutPanel from "../components/checkout/CheckoutPanel";

export default function POS() {
  const [showCheckout, setShowCheckout] = useState(false);

  return (
    <div style={{
      display: "flex",
      flex: 1,
      height: "100%",
      overflow: "hidden",
    }}>

      {/* Left — product grid */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--color-background-tertiary)",
      }}>
        {/* Search bar header */}
        <div style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--color-border-tertiary)",
          background: "var(--color-background-primary)",
          flexShrink: 0,
        }}>
          <input
            type="text"
            placeholder="Search products..."
            id="pos-search-trigger"
            style={{
              width: "100%",
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid var(--color-border-secondary)",
              background: "var(--color-background-secondary)",
              color: "var(--color-text-primary)",
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
            onChange={(e) => {
              // Dispatch custom event that ProductGrid listens to
              window.dispatchEvent(new CustomEvent("pos-search", { detail: e.target.value }));
            }}
          />
        </div>

        {/* Product grid */}
        <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          <ProductGrid externalSearch />
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: "var(--color-border-tertiary)", flexShrink: 0 }} />

      {/* Right — cart panel */}
      <div style={{
        width: 300,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-background-primary)",
        overflow: "hidden",
      }}>
        {/* Cart header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border-tertiary)",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--color-text-primary)",
          flexShrink: 0,
        }}>
          Cart
        </div>

        {/* Scrollable items */}
        <div style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: "8px 16px",
        }}>
          <Cart />
        </div>

        {/* Total + checkout pinned to bottom */}
        <div style={{ padding: "0 16px 16px", flexShrink: 0 }}>
          <CartSummary onCheckout={() => setShowCheckout(true)} />
        </div>
      </div>

      {/* Checkout modal */}
      {showCheckout && (
        <CheckoutPanel
          onClose={() => setShowCheckout(false)}
          onSuccess={() => setShowCheckout(false)}
        />
      )}
    </div>
  );
}