import { useState, useCallback, useEffect } from "react";
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

  // ── Customer ──────────────────────────────────────────────────────────────
  const [customerSearch,   setCustomerSearch]   = useState("");
  const [customerResults,  setCustomerResults]  = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searching,        setSearching]        = useState(false);

  // ── Loyalty ───────────────────────────────────────────────────────────────
  const [loyalty,          setLoyalty]          = useState(null);   // customer loyalty info
  const [redeemPoints,     setRedeemPoints]     = useState(0);      // points to redeem
  const [redeemPreview,    setRedeemPreview]    = useState(null);   // discount preview
  const [showRedeemInput,  setShowRedeemInput]  = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const activeBranchParam = getActiveBranchParam();
  const branchId = activeBranchParam.branch_id ?? user.branch_id;

  // Effective total after points redemption
  const effectiveTotal = redeemPreview
    ? Math.max(0, totalAmount - redeemPreview.discount_amount)
    : totalAmount;

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

  // Fetch loyalty info when customer is selected
  const fetchLoyalty = useCallback(async (customerId) => {
    try {
      const res = await api.get(`/loyalty/customer/${customerId}`);
      setLoyalty(res.data);
    } catch {
      setLoyalty(null);
    }
  }, []);

  const selectCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerSearch("");
    setCustomerResults([]);
    setLoyalty(null);
    setRedeemPoints(0);
    setRedeemPreview(null);
    setShowRedeemInput(false);
    if (!c.credit_enabled && paymentMethod === "charge_to_account") {
      setPaymentMethod("cash");
    }
    fetchLoyalty(c.customer_id);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerResults([]);
    setLoyalty(null);
    setRedeemPoints(0);
    setRedeemPreview(null);
    setShowRedeemInput(false);
    if (paymentMethod === "charge_to_account") setPaymentMethod("cash");
  };

  // ── Loyalty redemption preview ────────────────────────────────────────────
  const handleRedeemChange = async (pts) => {
    const p = parseInt(pts) || 0;
    setRedeemPoints(p);

    if (p <= 0 || !selectedCustomer) {
      setRedeemPreview(null);
      return;
    }

    try {
      const res = await api.get("/loyalty/redeem/preview", {
        params: {
          customer_id: selectedCustomer.customer_id,
          points:      p,
          sale_total:  totalAmount,
        },
      });
      setRedeemPreview(res.data);
    } catch (err) {
      setRedeemPreview(null);
      setError(err.response?.data?.detail || null);
    }
  };

  const clearRedemption = () => {
    setRedeemPoints(0);
    setRedeemPreview(null);
    setShowRedeemInput(false);
  };

  // ── Credit limit check ────────────────────────────────────────────────────
  const wouldExceedLimit = paymentMethod === "charge_to_account"
    && selectedCustomer?.credit_limit
    && (selectedCustomer.balance || 0) + totalAmount > selectedCustomer.credit_limit;

  // ── Submit sale ───────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (cartItems.length === 0) return;

    if (paymentMethod === "charge_to_account" && !selectedCustomer) {
      setError("Select a credit-enabled customer to charge to account.");
      return;
    }

    // Block if credit limit exceeded
    if (wouldExceedLimit) {
      setError("Credit limit exceeded. Cannot charge to account.");
      return;
    }

    // Points redemption only on direct sales
    if (redeemPoints > 0 && paymentMethod === "charge_to_account") {
      setError("Loyalty points cannot be redeemed on credit sales.");
      return;
    }

    setLoading(true);
    setError(null);

    const salePayload = {
      branch_id:      branchId,
      payment_method: paymentMethod === "charge_to_account" ? "credit" : paymentMethod,
      customer_id:    selectedCustomer?.customer_id || null,
      items:          getCartPayload(),
      // Note: discount is applied to total displayed, sale records effective total
      ...(redeemPreview ? { discount: redeemPreview.discount_amount } : {}),
    };

    try {
      if (!navigator.onLine) {
        const queued = queueSale(salePayload);
        clearCart();
        setReceipt({
          sale_id:        `QUEUED-${queued.id}`,
          sale_date:      new Date().toISOString(),
          total_amount:   effectiveTotal,
          payment_method: paymentMethod,
          customer_name:  selectedCustomer?.full_name || null,
          offline:        true,
          points_earned:  0,
        });
        return;
      }

      const result = await createSale(salePayload);

      let pointsEarned   = 0;
      let pointsRedeemed = 0;
      let newBalance     = loyalty?.points_balance || 0;

      // ── Redeem points if requested ────────────────────────────────────────
      if (redeemPoints > 0 && redeemPreview && selectedCustomer) {
        try {
          const redeemRes = await api.post("/loyalty/redeem", {
            customer_id: selectedCustomer.customer_id,
            points:      redeemPoints,
            sale_id:     result.sale_id,
          });
          pointsRedeemed = redeemPoints;
          newBalance     = redeemRes.data.points_remaining;

          // Send WhatsApp notification
          if (selectedCustomer.phone) {
            _sendLoyaltyWhatsApp(selectedCustomer, "redeem", {
              points: redeemPoints,
              discount: redeemPreview.discount_amount,
              remaining: redeemRes.data.points_remaining,
              remainingValue: redeemRes.data.points_value,
            }).catch(() => {});
          }
        } catch (redeemErr) {
          console.error("[Loyalty] Redeem failed:", redeemErr);
        }
      }

      // ── Earn points (only on direct sales, not credit) ────────────────────
      if (selectedCustomer && paymentMethod !== "charge_to_account") {
        try {
          const earnRes = await api.post("/loyalty/earn", null, {
            params: {
              customer_id:  selectedCustomer.customer_id,
              sale_amount:  effectiveTotal,
              sale_id:      result.sale_id,
            },
          });
          pointsEarned = earnRes.data.points_earned;
          newBalance   = earnRes.data.points_balance;

          // Send WhatsApp notification
          if (selectedCustomer.phone && pointsEarned > 0) {
            _sendLoyaltyWhatsApp(selectedCustomer, "earn", {
              points:  pointsEarned,
              balance: earnRes.data.points_balance,
              value:   earnRes.data.points_value,
            }).catch(() => {});
          }
        } catch (earnErr) {
          console.error("[Loyalty] Earn failed:", earnErr);
        }
      }

      // ── Charge to account — create ledger debit ───────────────────────────
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

      setReceipt({
        ...result,
        customer_name:   selectedCustomer?.full_name || null,
        points_earned:   pointsEarned,
        points_redeemed: pointsRedeemed,
        discount_amount: redeemPreview?.discount_amount || 0,
        new_points_balance: newBalance,
      });
      clearCart();

    } catch (err) {
      if (!err.response) {
        const queued = queueSale(salePayload);
        clearCart();
        setReceipt({
          sale_id:        `QUEUED-${queued.id}`,
          sale_date:      new Date().toISOString(),
          total_amount:   effectiveTotal,
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
    const isCredit = receipt.payment_method === "credit";
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <h2 style={headingStyle}>Sale complete ✓</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            {receipt.offline
              ? <span style={offlineBadge}>⏳ Saved offline — will sync when connected</span>
              : <span>Sale #{receipt.sale_id} · {new Date(receipt.sale_date).toLocaleString()}</span>}
          </div>
          {receipt.customer_name && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
              Customer: <strong style={{ color: "var(--color-text-primary)" }}>{receipt.customer_name}</strong>
            </div>
          )}
          <div style={summaryBox}>
            {receipt.discount_amount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#3B6D11", marginBottom: 6 }}>
                <span>🎁 Points discount ({receipt.points_redeemed} pts)</span>
                <span>− ₦{parseFloat(receipt.discount_amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
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
            {receipt.points_earned > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#3B6D11", background: "#EAF3DE", borderRadius: 6, padding: "4px 8px" }}>
                🏆 +{receipt.points_earned} loyalty points earned · Balance: {receipt.new_points_balance} pts
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

  const isDirectSale = paymentMethod !== "charge_to_account";
  const canRedeem    = isDirectSale && loyalty && loyalty.points_balance > 0;

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
            <span>Subtotal</span>
            <span>₦{totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
          </div>
          {redeemPreview && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#3B6D11", paddingTop: 6, marginTop: 4, borderTop: "1px solid var(--color-border-tertiary)" }}>
              <span>🎁 Points discount</span>
              <span>− ₦{redeemPreview.discount_amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          {redeemPreview && (
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: 14, paddingTop: 6, color: "var(--color-primary)" }}>
              <span>Total after discount</span>
              <span>₦{effectiveTotal.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>

        {/* Customer selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Customer (optional)</div>
          {selectedCustomer ? (
            <div style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
                    {selectedCustomer.full_name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selectedCustomer.phone && <span>{selectedCustomer.phone}</span>}
                    {selectedCustomer.credit_enabled && (
                      <span style={{ background: "#E6F1FB", color: "#185FA5", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 500 }}>
                        Credit · ₦{Math.abs(selectedCustomer.balance || 0).toLocaleString("en-NG")}
                        {selectedCustomer.balance < 0 ? " credit" : " owing"}
                        {selectedCustomer.credit_limit ? ` / ₦${selectedCustomer.credit_limit.toLocaleString("en-NG")} limit` : ""}
                      </span>
                    )}
                    {loyalty && loyalty.points_balance > 0 && (
                      <span style={{ background: "#EAF3DE", color: "#3B6D11", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 500 }}>
                        🏆 {loyalty.points_balance} pts (₦{loyalty.points_value.toLocaleString("en-NG")})
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={clearCustomer} style={{ background: "none", border: "none", fontSize: 18, color: "var(--color-text-tertiary)", cursor: "pointer" }}>×</button>
              </div>

              {/* Loyalty redemption section */}
              {canRedeem && !showRedeemInput && (
                <button onClick={() => setShowRedeemInput(true)} style={{ marginTop: 8, fontSize: 11, color: "#3B6D11", background: "#EAF3DE", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 500 }}>
                  🎁 Redeem {loyalty.points_balance} points (worth ₦{loyalty.points_value.toLocaleString("en-NG")})
                </button>
              )}

              {showRedeemInput && (
                <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="number"
                    min="1"
                    max={loyalty.points_balance}
                    value={redeemPoints || ""}
                    onChange={e => handleRedeemChange(e.target.value)}
                    placeholder={`Max ${loyalty.points_balance} pts`}
                    style={{ ...formInput, flex: 1, fontSize: 12, padding: "6px 10px" }}
                  />
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    pts → ₦{redeemPreview ? redeemPreview.discount_amount.toLocaleString("en-NG") : "0"}
                  </span>
                  <button onClick={clearRedemption} style={{ background: "none", border: "none", fontSize: 16, color: "var(--color-text-tertiary)", cursor: "pointer" }}>×</button>
                </div>
              )}
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
                      style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--color-border-tertiary)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{c.full_name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "flex", gap: 8, marginTop: 2 }}>
                        {c.phone && <span>{c.phone}</span>}
                        {c.credit_enabled && (
                          <span style={{ color: "#185FA5" }}>Credit · ₦{Math.abs(c.balance || 0).toLocaleString("en-NG")} {c.balance < 0 ? "credit" : "owing"}</span>
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
              <button key={method} onClick={() => {
                setPaymentMethod(method);
                if (method === "charge_to_account") clearRedemption();
              }} style={{
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

          {/* Credit / loyalty notices */}
          {selectedCustomer?.credit_enabled && (
            <div style={{ marginTop: 8 }}>
              {wouldExceedLimit ? (
                <div style={{ fontSize: 12, padding: "8px 10px", borderRadius: 7, background: "#FCEBEB", color: "#A32D2D", fontWeight: 500 }}>
                  🚫 Credit limit exceeded. Remaining: ₦{Math.max(0, selectedCustomer.credit_limit - (selectedCustomer.balance || 0)).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
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
            : wouldExceedLimit ? "Credit limit exceeded"
            : paymentMethod === "charge_to_account"
              ? `Charge ₦${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })} to account`
              : redeemPreview
                ? `Pay ₦${effectiveTotal.toLocaleString("en-NG", { minimumFractionDigits: 2 })} (₦${redeemPreview.discount_amount.toLocaleString("en-NG")} discount)`
                : `Confirm — ₦${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
        </button>
      </div>
    </div>
  );
}

// ── WhatsApp notification helper ──────────────────────────────────────────────
async function _sendLoyaltyWhatsApp(customer, type, data) {
  // Fire-and-forget — backend sends the WhatsApp message
  await api.post("/loyalty/notify", {
    customer_id: customer.customer_id,
    type,
    ...data,
  }).catch(() => {});
}

const overlayStyle  = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const panelStyle    = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, border: "1px solid var(--color-border-tertiary)", boxShadow: "var(--shadow)", maxHeight: "90vh", overflowY: "auto" };
const headingStyle  = { fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 };
const headerRow     = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 };
const closeBtnStyle = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer" };
const orderBox      = { background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, maxHeight: 180, overflowY: "auto" };
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