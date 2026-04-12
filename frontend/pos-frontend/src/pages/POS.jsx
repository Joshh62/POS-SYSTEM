import { useState } from "react";
import ProductGrid from "../components/products/ProductGrid";
import Cart from "../components/cart/Cart";
import CartSummary from "../components/cart/CartSummary";
import CheckoutPanel from "../components/checkout/CheckoutPanel";

export default function POS() {
  const [showCheckout, setShowCheckout] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        background: "var(--color-background-tertiary)",
        overflow: "hidden",
      }}
    >
        {/* Left — product grid */}
        <div
          style={{
            flex: 1,
            padding: 16,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <ProductGrid />
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: "var(--color-border-tertiary)", flexShrink: 0 }} />

        {/* Right — cart panel */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            padding: 16,
            background: "var(--color-background-primary)",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>
            Cart
          </div>

          {/* Scrollable cart items */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <Cart />
          </div>

          {/* Total + checkout button always visible at bottom */}
          <CartSummary onCheckout={() => setShowCheckout(true)} />
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