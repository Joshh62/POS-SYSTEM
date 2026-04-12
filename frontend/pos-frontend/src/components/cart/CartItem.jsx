import { useCart } from "../../context/CartContext";

export default function CartItem({ item }) {
  const { updateQuantity, removeFromCart } = useCart();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid var(--color-border-tertiary)",
      }}
    >
      {/* Product name + price */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.product_name}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          ₦{item.selling_price.toLocaleString("en-NG", { minimumFractionDigits: 2 })} each
        </div>
      </div>

      {/* Quantity controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
          style={qtyBtn}
        >
          −
        </button>

        <span
          style={{
            minWidth: 24,
            textAlign: "center",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-primary)",
          }}
        >
          {item.quantity}
        </span>

        <button
          onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
          style={qtyBtn}
        >
          +
        </button>
      </div>

      {/* Subtotal */}
      <div
        style={{
          minWidth: 70,
          textAlign: "right",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--color-text-primary)",
        }}
      >
        ₦{(item.selling_price * item.quantity).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
        })}
      </div>

      {/* Remove button */}
      <button
        onClick={() => removeFromCart(item.product_id)}
        style={{
          background: "none",
          border: "none",
          color: "#A32D2D",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: "0 2px",
        }}
        title="Remove"
      >
        ×
      </button>
    </div>
  );
}

const qtyBtn = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid var(--color-border-secondary)",
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
};