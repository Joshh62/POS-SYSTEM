import { useCart } from "../../context/CartContext";

export default function ProductCard({ product }) {
  const { addToCart, cartItems } = useCart();

  const cartItem = cartItems.find((i) => i.product_id === product.product_id);
  const inCart = cartItem ? cartItem.quantity : 0;

  return (
    <div
      style={{
        background: "var(--surface)",             // ✅ FIXED
        border: "1px solid var(--border)",        // ✅ FIXED
        borderRadius: 12,
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "pointer",
        transition: "all 0.15s ease",
        position: "relative",
      }}
      onClick={() => addToCart(product)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-primary)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >

      {/* In-cart badge */}
      {inCart > 0 && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "var(--color-primary)",   // 🔥 BRAND COLOR
            color: "#fff",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
          }}
        >
          {inCart}
        </div>
      )}

      {/* Product name */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-h)",                // ✅ FIXED
          lineHeight: 1.3,
          paddingRight: inCart > 0 ? 40 : 0,
        }}
      >
        {product.product_name}
      </div>

      {/* Barcode */}
      <div style={{ fontSize: 11, color: "var(--text)" }}>
        {product.barcode}
      </div>

      {/* Price */}
      <div
        style={{
          marginTop: 6,
          fontSize: 16,
          fontWeight: 700,
          color: "var(--color-primary)",         // 🔥 IMPORTANT
        }}
      >
        ₦{parseFloat(product.selling_price).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
        })}
      </div>

      {/* Hint */}
      <div
        style={{
          marginTop: 2,
          fontSize: 11,
          color: "var(--text)",
          opacity: 0.7,
        }}
      >
        Tap to add
      </div>
    </div>
  );
}