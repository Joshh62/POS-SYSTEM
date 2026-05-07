import { useState, useCallback } from "react";
import { useCart } from "../../context/CartContext";
import { createSale, getInvoiceUrl, getActiveBranchParam } from "../../api/api";
import { queueSale } from "../../utils/offlineQueue";
import api from "../../api/api";

const PAYMENT_METHODS = ["cash", "card", "transfer"];

export default function CheckoutPanel({ onClose, onSuccess }) {
  const { cartItems, totalAmount, getCartPayload, clearCart } = useCart();

  const [paymentMethod,    setPaymentMethod]    = useState("cash");
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState(null);
  const [receipt,          setReceipt]          = useState(null);

  // ── Customer selection ────────────────────────────────────────────────────
  const [customerSearch,   setCustomerSearch]   = useState("");
  const [customerResults,  setCustomerResults]  = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searching,        setSearching]        = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const activeBranchParam = getActiveBranchParam();
  const branchId = activeBranchParam.branch_id ?? user.branch_id;

  // ── Customer search ───────────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q) => {
    if (q.length < 2) { setCustomerResults([]); return; }
    setSearching(true);
    try {
      const res = await api.get("/customers/search/quick", { params: { q } });
      setCustomerResults(res.data);
    } catch { setCustomerResults([]); }
    finally { setSearching(false); }
  }, []);

  const selectCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerSearch("");
    setCustomerResults([]);
    if (!c.credit_enabled && paymentMethod === "charge_to_account") {
      setPaymentMethod("cash");
    }
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerResults([]);
    if (paymentMethod === "charge_to_account") setPaymentMethod("cash");
  };

  // ── Submit sale ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (cartItems.length === 0) return;

    if (paymentMethod === "charge_to_account" && !selectedCustomer) {
      setError("Select a credit-enabled customer to charge to account.");
      return;
    }

    // ── Credit limit check — block sale BEFORE it goes through ────────────
    if (paymentMethod === "charge_to_account" && selectedCustomer?.credit_limit) {
      const currentBalance = selectedCustomer.balance || 0;
      const newBalance     = currentBalance + totalAmount;
      if (newBalance > selectedCustomer.credit_limit) {
        const remaining = Math.max(0, selectedCustomer.credit_limit - currentBalance);
        setError(
          `Credit limit exceeded for ${selectedCustomer.full_name}. ` +
          `Limit: ₦${selectedCustomer.credit_limit.toLocaleString("en-NG", { minimumFractionDigits: 2 })} · ` +
          `Current balance: ₦${currentBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })} · ` +
          `Remaining credit: ₦${remaining.toLocaleString("en-NG", { minimumFractionDigits: 2 })} · ` +
          `This charge: ₦${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`
        );
        return;
      }
    }

    setLoading(true);
    setError(null);

    const salePayload = {
      branch_id:      branchId,
      payment_method: paymentMethod === "charge_to_account" ? "credit" : paymentMethod,
      customer_id:    selectedCustomer?.customer_id || null,
      items:          getCartPayload(),
    };

    try {
      if (!navigator.onLine) {
        const queued = queueSale(salePayload);
        clearCart();
        setReceipt({
          sale_id:        `QUEUED-${queued.id}`,
          sale_date:      new Date().toISOString(),
          total_amount:   totalAmount,
          payment_method: paymentMethod,
          customer_name:  selectedCustomer?.full_name || null,
          offline:        true,
        });
        return;
      }

      const result = await createSale(salePayload);

      // If charge to account — create ledger debit entry automatically
      if (paymentMethod === "charge_to_account" && selectedCustomer) {
        try {
          await api.post("/ledger/debit", {
            customer_id:  selectedCustomer.customer_id,
            amount:       totalAmount,
            description:  `Sale #${result.sale_id} charged to account`,
            reference_id: result.sale_id,
            branch_id:    branchId,
          });
        } catch (ledgerErr) {
          console.error("[Checkout] Failed to create ledger entry:", ledgerErr);
        }
      }

      setReceipt({ ...result, customer_name: selectedCustomer?.full_name || null });
      clearCart();

    } catch (err) {
      if (!err.response) {
        const queued = queueSale(salePayload);
        clearCart();
        setReceipt({
          sale_id:        `QUEUED-${queued.id}`,
          sale_date:      new Date().toISOString(),
          total_amount:   totalAmount,
          payment_method: paymentMethod,
          customer_name:  selectedCustomer?.full_name || null,
          offline:        true,
        });
        return;
      }
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Sale failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Receipt view ──────────────────────────────────────────────────────────
  if (receipt) {
    const isCredit = receipt.payment_method === "credit" || receipt.payment_method === "charge_to_account";
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <h2 style={headingStyle}>Sale complete ✓</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            {receipt.offline ? (
              <span style={offlineBadge}>⏳ Saved offline — will sync when connected</span>
            ) : (
              <span>Sale #{receipt.sale_id} · {new Date(receipt.sale_date).toLocaleString()}</span>
            )}
          </div>
          {receipt.customer_name && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
              Customer: <strong style={{ color: "var(--color-text-primary)" }}>{receipt.customer_name}</strong>
            </div>
          )}
          <div style={summaryBox}>
            <div style={summaryRow}>
              <span>{isCredit ? "Charged to account" : "Total paid"}</span>
              <span>₦{parseFloat(receipt.total_amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={summarySub}>via {isCredit ? "credit account" : receipt.payment_method}</div>
            {isCredit && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#854F0B", background: "#FAEEDA", borderRadius: 6, padding: "4px 8px" }}>
                ⚠️ Added to {receipt.customer_name}'s ledger balance
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!receipt.offline && (
              <a href={getInvoiceUrl(receipt.sale_id)} target="_blank" rel="noreferrer" style={secondaryBtn}>
                Print invoice
              </a>
            )}
            <button onClick={() => { onSuccess?.(); onClose(); }} style={primaryBtn}>New sale</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Checkout form ─────────────────────────────────────────────────────────
  const allMethods = [
    ...PAYMENT_METHODS,
    ...(selectedCustomer?.credit_enabled ? ["charge_to_account"] : []),
  ];

  // Pre-compute whether this charge would exceed the limit
  const wouldExceedLimit = paymentMethod === "charge_to_account"
    && selectedCustomer?.credit_limit
    && (selectedCustomer.balance || 0) + totalAmount > selectedCustomer.credit_limit;

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
              <span style={{ color: "var(--color-text-primary)" }}>{item.product_name} × {item.quantity}</span>
              <span style={{ color: "var(--color-text-secondary)" }}>
                ₦{(item.selling_price * item.quantity).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
          <div style={orderTotal}>
            <span>Total</span>
            <span>₦{totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Customer selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Customer (optional)</div>
          {selectedCustomer ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: "8px 12px" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {selectedCustomer.full_name}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                  {selectedCustomer.phone}
                  {selectedCustomer.credit_enabled && (
                    <span style={{ marginLeft: 8, background: "#E6F1FB", color: "#185FA5", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 500 }}>
                      Credit · ₦{Math.abs(selectedCustomer.balance || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                      {selectedCustomer.balance < 0 ? " (has credit)" : selectedCustomer.balance > 0 ? " owing" : " clear"}
                      {selectedCustomer.credit_limit ? ` / limit ₦${selectedCustomer.credit_limit.toLocaleString("en-NG")}` : ""}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={clearCustomer} style={{ background: "none", border: "none", fontSize: 18, color: "var(--color-text-tertiary)", cursor: "pointer" }}>×</button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <input
                style={{ ...formInput, width: "100%", boxSizing: "border-box" }}
                placeholder="Search by name or phone..."
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); searchCustomers(e.target.value); }}
              />
              {customerResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, zIndex: 100, maxHeight: 200, overflowY: "auto", marginTop: 2 }}>
                  {customerResults.map(c => (
                    <div key={c.customer_id} onClick={() => selectCustomer(c)}
                      style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--color-border-tertiary)", color: "var(--color-text-primary)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ fontWeight: 500 }}>{c.full_name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "flex", gap: 8, marginTop: 2 }}>
                        {c.phone && <span>{c.phone}</span>}
                        {c.credit_enabled && (
                          <span style={{ color: "#185FA5" }}>
                            Credit · ₦{Math.abs(c.balance || 0).toLocaleString("en-NG")} {c.balance < 0 ? "credit" : "owing"}
                            {c.credit_limit ? ` / ₦${c.credit_limit.toLocaleString("en-NG")} limit` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {searching && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>Searching...</div>}
            </div>
          )}
        </div>

        {/* Payment method */}
        <div style={{ marginBottom: 16 }}>
          <div style={label}>Payment method</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {allMethods.map((method) => (
              <button key={method} onClick={() => setPaymentMethod(method)} style={{
                flex: method === "charge_to_account" ? "1 1 100%" : 1,
                padding: "8px 0", borderRadius: 8, cursor: "pointer", fontSize: 13,
                border: `1px solid ${paymentMethod === method ? "var(--color-primary)" : "var(--color-border-tertiary)"}`,
                background: paymentMethod === method
                  ? (method === "charge_to_account" ? "rgba(133,79,11,0.1)" : "var(--color-primary-light)")
                  : "var(--color-background-secondary)",
                color: paymentMethod === method
                  ? (method === "charge_to_account" ? "#854F0B" : "var(--color-primary)")
                  : "var(--color-text-secondary)",
                fontWeight: paymentMethod === method ? 500 : 400,
              }}>
                {method === "charge_to_account" ? "📒 Charge to account" : method.charAt(0).toUpperCase() + method.slice(1)}
              </button>
            ))}
          </div>

          {/* Credit balance / limit warning */}
          {selectedCustomer?.credit_enabled && (
            <div style={{ marginTop: 8 }}>
              {wouldExceedLimit ? (
                <div style={{ fontSize: 12, padding: "8px 10px", borderRadius: 7, background: "#FCEBEB", color: "#A32D2D", fontWeight: 500 }}>
                  🚫 This charge of ₦{totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })} would exceed{" "}
                  {selectedCustomer.full_name}'s credit limit of ₦{selectedCustomer.credit_limit.toLocaleString("en-NG", { minimumFractionDigits: 2 })}.
                  Remaining credit: ₦{Math.max(0, selectedCustomer.credit_limit - (selectedCustomer.balance || 0)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}.
                </div>
              ) : selectedCustomer.balance < 0 ? (
                <div style={{ fontSize: 12, padding: "7px 10px", borderRadius: 7, background: "#EAF3DE", color: "#3B6D11" }}>
                  ✅ {selectedCustomer.full_name} has ₦{Math.abs(selectedCustomer.balance).toLocaleString("en-NG")} credit on account
                </div>
              ) : selectedCustomer.balance > 0 ? (
                <div style={{ fontSize: 12, padding: "7px 10px", borderRadius: 7, background: "#FAEEDA", color: "#854F0B" }}>
                  ⚠️ {selectedCustomer.full_name} owes ₦{selectedCustomer.balance.toLocaleString("en-NG")} on account
                </div>
              ) : null}
            </div>
          )}
        </div>

        {error && <div style={errorBox}>{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={loading || wouldExceedLimit}
          style={{
            ...primaryBtn, width: "100%",
            opacity: (loading || wouldExceedLimit) ? 0.5 : 1,
            cursor:  (loading || wouldExceedLimit) ? "not-allowed" : "pointer",
            background: wouldExceedLimit ? "#A32D2D" : "var(--color-primary)",
          }}
        >
          {loading ? "Processing..."
            : wouldExceedLimit ? "Credit limit exceeded — cannot charge to account"
            : paymentMethod === "charge_to_account"
              ? `Charge ₦${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })} to account`
              : `Confirm — ₦${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
        </button>
      </div>
    </div>
  );
}

const overlayStyle  = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const panelStyle    = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, border: "1px solid var(--color-border-tertiary)", boxShadow: "var(--shadow)", maxHeight: "90vh", overflowY: "auto" };
const headingStyle  = { fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 };
const headerRow     = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 };
const closeBtnStyle = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer" };
const orderBox      = { background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, maxHeight: 160, overflowY: "auto" };
const orderRow      = { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--color-border-tertiary)" };
const orderTotal    = { display: "flex", justifyContent: "space-between", fontWeight: 500, fontSize: 14, paddingTop: 8, marginTop: 4, color: "var(--color-text-primary)" };
const summaryBox    = { background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 14px", marginBottom: 14 };
const summaryRow    = { display: "flex", justifyContent: "space-between", fontWeight: 500, color: "var(--color-text-primary)" };
const summarySub    = { marginTop: 4, fontSize: 11, color: "var(--color-text-secondary)" };
const label         = { fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8 };
const errorBox      = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 };
const primaryBtn    = { flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const secondaryBtn  = { flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, textAlign: "center", textDecoration: "none" };
const offlineBadge  = { background: "#FAEEDA", color: "#854F0B", fontSize: 11, padding: "2px 8px", borderRadius: 8, fontWeight: 500 };
const formInput     = { padding: "9px 11px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", outline: "none", fontFamily: "inherit" };