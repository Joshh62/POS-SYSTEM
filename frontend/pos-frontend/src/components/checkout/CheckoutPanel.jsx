import { useState } from "react";
import { useCart } from "../../context/CartContext";
import { createSale } from "../../api/api";
import { queueSale, registerSyncListener } from "../../utils/offlineQueue";

const PAYMENT_METHODS = ["cash", "card", "transfer"];

export default function CheckoutPanel({ onClose, onSuccess }) {
  const { cartItems, totalAmount, getCartPayload, clearCart } = useCart();

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);


  const handleSubmit = async () => {
    if (cartItems.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const salePayload = {
        payment_method: paymentMethod,
        items: getCartPayload(),
      };

      if (!navigator.onLine) {
        // Offline — queue the sale locally
        const queued = queueSale(salePayload);
        clearCart();
        setReceipt({
          sale_id: `QUEUED-${queued.id}`,
          sale_date: new Date().toISOString(),
          total_amount: totalAmount,
          payment_method: paymentMethod,
          offline: true,
        });
        return;
      }

      const result = await createSale(salePayload);
      setReceipt(result);
      clearCart();

    } catch (err) {
      // Network error — queue offline
      if (!err.response) {
        const salePayload = {
          payment_method: paymentMethod,
          items: getCartPayload(),
        };
        const queued = queueSale(salePayload);
        clearCart();
        setReceipt({
          sale_id: `QUEUED-${queued.id}`,
          sale_date: new Date().toISOString(),
          total_amount: totalAmount,
          payment_method: paymentMethod,
          offline: true,
        });
        return;
      }
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Sale failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ---- Receipt view (shown after successful sale) ----
  if (receipt) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <h2 style={headingStyle}>Sale complete</h2>

          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            {receipt.offline ? (
            <span style={{ background: "#FAEEDA", color: "#854F0B", fontSize: 11, padding: "2px 8px", borderRadius: 8, fontWeight: 500 }}>
              ⏳ Saved offline — will sync when connected
            </span>
          ) : (
            <span>Sale #{receipt.sale_id} · {new Date(receipt.sale_date).toLocaleString()}</span>
          )}
          </div>

          <div
            style={{
              background: "var(--color-background-secondary)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 13,
              color: "var(--color-text-primary)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 500 }}>
              <span>Total paid</span>
              <span>₦{parseFloat(receipt.total_amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-text-tertiary)" }}>
              via {receipt.payment_method}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={`http://127.0.0.1:8000/sales/${receipt.sale_id}/invoice`}
              target="_blank"
              rel="noreferrer"
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                border: "1px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)",
                color: "var(--color-text-primary)",
                fontSize: 13,
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Print invoice
            </a>

            <button
              onClick={() => { onSuccess?.(); onClose(); }}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                border: "none",
                background: "#185FA5",
                color: "#E6F1FB",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              New sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Checkout form ----
  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={headingStyle}>Checkout</h2>
          <button onClick={onClose} style={closeBtnStyle}>×</button>
        </div>

        {/* Order summary */}
        <div
          style={{
            background: "var(--color-background-secondary)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {cartItems.map((item) => (
            <div
              key={item.product_id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                padding: "4px 0",
                borderBottom: "1px solid var(--color-border-tertiary)",
              }}
            >
              <span style={{ color: "var(--color-text-primary)" }}>
                {item.product_name} × {item.quantity}
              </span>
              <span style={{ color: "var(--color-text-secondary)" }}>
                ₦{(item.selling_price * item.quantity).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontWeight: 500,
              fontSize: 14,
              paddingTop: 8,
              marginTop: 4,
              color: "var(--color-text-primary)",
            }}
          >
            <span>Total</span>
            <span>₦{totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Payment method */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8 }}>
            Payment method
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: 8,
                  border: `1px solid ${paymentMethod === method ? "#185FA5" : "var(--color-border-secondary)"}`,
                  background: paymentMethod === method ? "#E6F1FB" : "var(--color-background-primary)",
                  color: paymentMethod === method ? "#185FA5" : "var(--color-text-secondary)",
                  fontSize: 13,
                  fontWeight: paymentMethod === method ? 500 : 400,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              background: "#FCEBEB",
              color: "#A32D2D",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            padding: "13px 0",
            borderRadius: 10,
            border: "none",
            background: loading ? "var(--color-background-secondary)" : "#185FA5",
            color: loading ? "var(--color-text-tertiary)" : "#E6F1FB",
            fontSize: 15,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Processing..." : `Confirm — ₦${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
        </button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle = {
  background: "var(--color-background-primary)",
  borderRadius: 14,
  padding: 24,
  width: "100%",
  maxWidth: 420,
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};

const headingStyle = {
  fontSize: 18,
  fontWeight: 500,
  color: "var(--color-text-primary)",
  margin: 0,
};

const closeBtnStyle = {
  background: "none",
  border: "none",
  fontSize: 22,
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  lineHeight: 1,
  padding: 0,
};