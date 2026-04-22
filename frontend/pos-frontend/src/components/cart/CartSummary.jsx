import { useCart } from "../../context/CartContext";

export default function CartSummary({ onCheckout }) {
  const { cartItems, totalAmount } = useCart();

  const isEmpty = cartItems.length === 0;

  return (
    <div
      style={{
        borderTop: "1px solid var(--border)", // ✅ fixed
        paddingTop: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Total row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "var(--text)" }}>Total</span>
        <span style={{ fontSize: 20, fontWeight: 600, color: "var(--text-h)" }}>
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
          background: isEmpty ? "var(--border)" : "var(--color-accent)", // 🔥 ORANGE CTA
          color: isEmpty ? "var(--text)" : "#fff",
          fontSize: 15,
          fontWeight: 600,
          cursor: isEmpty ? "not-allowed" : "pointer",
          transition: "opacity 0.15s",
          opacity: isEmpty ? 0.7 : 1,
        }}
      >
        {isEmpty
          ? "Add items to checkout"
          : `Checkout — ₦${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
      </button>
    </div>
  );
}