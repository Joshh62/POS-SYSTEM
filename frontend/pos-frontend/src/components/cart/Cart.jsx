import { useCart } from "../../context/CartContext";
import CartItem from "./CartItem";

export default function Cart() {
  const { cartItems, clearCart, totalItems } = useCart();

  // ---- EMPTY STATE ----
  if (cartItems.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: "var(--color-text-tertiary)",
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 32 }}>🛒</div>
        <div style={{ color: "var(--color-text-secondary)" }}>
          Cart is empty
        </div>
        <div style={{ fontSize: 11 }}>
          Tap a product to add it
        </div>
      </div>
    );
  }

  // ---- CART WITH ITEMS ----
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 8,
          borderBottom: "1px solid var(--color-border-tertiary)",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-secondary)",
          }}
        >
          {totalItems} item{totalItems !== 1 ? "s" : ""}
        </span>

        <button
          onClick={clearCart}
          style={{
            background: "var(--color-background-secondary)",
            border: "1px solid var(--color-border-secondary)",
            color: "var(--color-text-secondary)",
            fontSize: 12,
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 6,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-primary)";
            e.currentTarget.style.color = "var(--color-text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-secondary)";
            e.currentTarget.style.color = "var(--color-text-secondary)";
          }}
        >
          Clear
        </button>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
        {cartItems.map((item) => (
          <CartItem key={item.product_id} item={item} />
        ))}
      </div>
    </div>
  );
}