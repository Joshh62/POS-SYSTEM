import { useState } from "react";
import { useCart } from "../../context/CartContext";
import { createSale } from "../../api/api";
import { queueSale } from "../../utils/offlineQueue";

const PAYMENT_METHODS = ["cash", "card", "transfer"];

export default function CheckoutPanel({ onClose, onSuccess }) {
  const { cartItems, totalAmount, getCartPayload, clearCart } = useCart();

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);

  // ✅ FIX: get branch_id from logged-in user
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const branchId = user.branch_id;

  const handleSubmit = async () => {
    if (cartItems.length === 0) return;

    if (!branchId) {
      setError("Branch not assigned. Please log in again.");
      return;
    }

    setLoading(true);
    setError(null);

    const salePayload = {
      branch_id: branchId, // ✅ REQUIRED
      payment_method: paymentMethod,
      items: getCartPayload(),
    };

    try {
      // OFFLINE MODE
      if (!navigator.onLine) {
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

      // ONLINE
      const result = await createSale(salePayload);
      setReceipt(result);
      clearCart();

    } catch (err) {
      // NETWORK FAIL → fallback to offline
      if (!err.response) {
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

  // =========================
  // RECEIPT VIEW
  // =========================
  if (receipt) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <h2 style={headingStyle}>Sale complete</h2>

          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 12 }}>
            {receipt.offline ? (
              <span style={offlineBadge}>
                ⏳ Saved offline — will sync when connected
              </span>
            ) : (
              <span>
                Sale #{receipt.sale_id} ·{" "}
                {new Date(receipt.sale_date).toLocaleString()}
              </span>
            )}
          </div>

          <div style={summaryBox}>
            <div style={summaryRow}>
              <span>Total paid</span>
              <span>
                ₦
                {parseFloat(receipt.total_amount).toLocaleString("en-NG", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>

            <div style={summarySub}>
              via {receipt.payment_method}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {!receipt.offline && (
              <a
                href={`/sales/${receipt.sale_id}/invoice`}
                target="_blank"
                rel="noreferrer"
                style={secondaryBtn}
              >
                Print invoice
              </a>
            )}

            <button
              onClick={() => {
                onSuccess?.();
                onClose();
              }}
              style={primaryBtn}
            >
              New sale
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // CHECKOUT FORM
  // =========================
  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerRow}>
          <h2 style={headingStyle}>Checkout</h2>
          <button onClick={onClose} style={closeBtnStyle}>×</button>
        </div>

        {/* Order summary */}
        <div style={orderBox}>
          {cartItems.map((item) => (
            <div key={item.product_id} style={orderRow}>
              <span style={{ color: "var(--text-h)" }}>
                {item.product_name} × {item.quantity}
              </span>
              <span style={{ color: "var(--text)" }}>
                ₦
                {(item.selling_price * item.quantity).toLocaleString("en-NG", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </div>
          ))}

          <div style={orderTotal}>
            <span>Total</span>
            <span>
              ₦
              {totalAmount.toLocaleString("en-NG", {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Payment */}
        <div style={{ marginBottom: 16 }}>
          <div style={label}>Payment method</div>

          <div style={{ display: "flex", gap: 8 }}>
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: 8,
                  border: `1px solid ${
                    paymentMethod === method
                      ? "var(--color-primary)"
                      : "var(--border)"
                  }`,
                  background:
                    paymentMethod === method
                      ? "var(--color-primary-light)"
                      : "var(--surface)",
                  color:
                    paymentMethod === method
                      ? "var(--color-primary)"
                      : "var(--text)",
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

        {/* Error */}
        {error && <div style={errorBox}>{error}</div>}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            ...primaryBtn,
            width: "100%",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading
            ? "Processing..."
            : `Confirm — ₦${totalAmount.toLocaleString("en-NG", {
                minimumFractionDigits: 2,
              })}`}
        </button>
      </div>
    </div>
  );
}

/* =========================
   STYLES
========================= */

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
  background: "var(--surface)",
  borderRadius: 14,
  padding: 24,
  width: "100%",
  maxWidth: 420,
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
};

const headingStyle = {
  fontSize: 18,
  fontWeight: 600,
  color: "var(--text-h)",
  margin: 0,
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const closeBtnStyle = {
  background: "none",
  border: "none",
  fontSize: 22,
  color: "var(--text)",
  cursor: "pointer",
};

const orderBox = {
  background: "var(--color-background-secondary)",
  borderRadius: 8,
  padding: "10px 14px",
  marginBottom: 16,
  maxHeight: 180,
  overflowY: "auto",
};

const orderRow = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  padding: "4px 0",
  borderBottom: "1px solid var(--border)",
};

const orderTotal = {
  display: "flex",
  justifyContent: "space-between",
  fontWeight: 500,
  fontSize: 14,
  paddingTop: 8,
  marginTop: 4,
  color: "var(--text-h)",
};

const summaryBox = {
  background: "var(--color-background-secondary)",
  borderRadius: 8,
  padding: "10px 14px",
  marginBottom: 14,
};

const summaryRow = {
  display: "flex",
  justifyContent: "space-between",
  fontWeight: 500,
};

const summarySub = {
  marginTop: 4,
  fontSize: 11,
  color: "var(--text)",
};

const label = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text)",
  marginBottom: 8,
};

const errorBox = {
  background: "var(--error-bg)",
  color: "var(--error-text)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  marginBottom: 12,
};

const primaryBtn = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 8,
  border: "none",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const secondaryBtn = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-h)",
  fontSize: 13,
  textAlign: "center",
  textDecoration: "none",
};

const offlineBadge = {
  background: "#FAEEDA",
  color: "#854F0B",
  fontSize: 11,
  padding: "2px 8px",
  borderRadius: 8,
  fontWeight: 500,
};