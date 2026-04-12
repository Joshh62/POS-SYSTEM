import { useCart } from "../../context/CartContext";

export default function CartSummary({ onCheckout }) {
  const { cartItems, totalAmount } = useCart();

  const isEmpty = cartItems.length === 0;

  return (
    <div
      style={{
        borderTop: "1px solid var(--color-border-tertiary)",
        paddingTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Total row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>Total</span>
        <span style={{ fontSize: 20, fontWeight: 500, color: "var(--color-text-primary)" }}>
          ₦{totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
        </span>
      </div>

      {/* Checkout button */}
      <button
        onClick={onCheckout}
        disabled={isEmpty}
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: 10,
          border: "none",
          background: isEmpty ? "var(--color-background-secondary)" : "#185FA5",
          color: isEmpty ? "var(--color-text-tertiary)" : "#E6F1FB",
          fontSize: 15,
          fontWeight: 500,
          cursor: isEmpty ? "not-allowed" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {isEmpty ? "Add items to checkout" : `Checkout — ₦${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
      </button>
    </div>
  );
}