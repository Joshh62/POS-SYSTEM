import { useCart } from "../../context/CartContext";
import CartItem from "./CartItem";

export default function Cart() {
  const { cartItems, clearCart, totalItems } = useCart();

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
        <div>Cart is empty</div>
        <div style={{ fontSize: 11 }}>Tap a product to add it</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Cart header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: 8,
          borderBottom: "1px solid var(--color-border-tertiary)",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>
          {totalItems} item{totalItems !== 1 ? "s" : ""}
        </span>

        <button
          onClick={clearCart}
          style={{
            background: "none",
            border: "none",
            color: "#A32D2D",
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Clear all
        </button>
      </div>

      {/* Scrollable item list */}
      <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
        {cartItems.map((item) => (
          <CartItem key={item.product_id} item={item} />
        ))}
      </div>
    </div>
  );
}