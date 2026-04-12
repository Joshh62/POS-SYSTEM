import { useCart } from "../../context/CartContext";

export default function ProductCard({ product }) {
  const { addToCart, cartItems } = useCart();

  const cartItem = cartItems.find((i) => i.product_id === product.product_id);
  const inCart = cartItem ? cartItem.quantity : 0;

  return (
    <div
      style={{
        background: "var(--color-background-secondary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: 10,
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "pointer",
        transition: "border-color 0.15s",
        position: "relative",
      }}
      onClick={() => addToCart(product)}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--color-border-primary)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--color-border-tertiary)")}
    >
      {/* In-cart badge */}
      {inCart > 0 && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "#185FA5",
            color: "#E6F1FB",
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 7px",
          }}
        >
          {inCart} in cart
        </div>
      )}

      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--color-text-primary)",
          lineHeight: 1.3,
          paddingRight: inCart > 0 ? 60 : 0,
        }}
      >
        {product.product_name}
      </div>

      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
        {product.barcode}
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 15,
          fontWeight: 500,
          color: "#185FA5",
        }}
      >
        ₦{parseFloat(product.selling_price).toLocaleString("en-NG", {
          minimumFractionDigits: 2,
        })}
      </div>

      <div
        style={{
          marginTop: 2,
          fontSize: 11,
          color: "var(--color-text-secondary)",
        }}
      >
        Tap to add
      </div>
    </div>
  );
}