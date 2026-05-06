import { useState, useEffect, useCallback } from "react";
import api from "../api/api";
import { useBranch } from "../context/BranchContext";

const STATUS_COLORS = {
  open:        { bg: "#FCEBEB", color: "#A32D2D" },
  partial:     { bg: "#FAEEDA", color: "#854F0B" },
  paid:        { bg: "#EAF3DE", color: "#3B6D11" },
  written_off: { bg: "#F1EFE8", color: "#5F5E5A" },
};

const STATUS_LABELS = {
  open: "Unpaid", partial: "Partial", paid: "Paid", written_off: "Written off",
};

const PAYMENT_METHODS = ["cash", "card", "transfer"];

export default function DebtTrackingPage() {
  const { activeBranchId } = useBranch();
  const user    = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = ["admin", "superadmin"].includes(user.role);

  const [debts,    setDebts]    = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState("");
  const [search,       setSearch]       = useState("");

  // ── Create debt modal ─────────────────────────────────────────────────────
  const [showCreate,   setShowCreate]   = useState(false);
  const [createForm,   setCreateForm]   = useState({
    customerSearch: "", selectedCustomer: null, newName: "", newPhone: "",
    isNew: false, totalAmount: "", amountPaid: "", description: "", dueDate: "",
  });
  const [customerResults, setCustomerResults] = useState([]);
  const [searching,        setSearching]      = useState(false);
  const [createLoading,    setCreateLoading]  = useState(false);
  const [createError,      setCreateError]    = useState(null);

  // ── Record payment modal ──────────────────────────────────────────────────
  const [payingDebt,    setPayingDebt]    = useState(null);
  const [payForm,       setPayForm]       = useState({ amount: "", method: "cash", notes: "" });
  const [payLoading,    setPayLoading]    = useState(false);
  const [payError,      setPayError]      = useState(null);

  // ── Payment history modal ─────────────────────────────────────────────────
  const [viewingDebt,   setViewingDebt]   = useState(null);
  const [debtPayments,  setDebtPayments]  = useState([]);
  const [histLoading,   setHistLoading]   = useState(false);

  const fetchAll = async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (activeBranchId) params.branch_id = activeBranchId;
      if (filterStatus)   params.status    = filterStatus;
      if (search)         params.search    = search;

      const [dRes, sRes] = await Promise.all([
        api.get("/debts/",        { params }),
        api.get("/debts/summary", { params }),
      ]);
      setDebts(dRes.data);
      setSummary(sRes.data);
    } catch {
      setError("Failed to load debts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [activeBranchId, filterStatus]);

  // ── Customer search ───────────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q) => {
    if (q.length < 2) { setCustomerResults([]); return; }
    setSearching(true);
    try {
      const res = await api.get("/debts/customers/search", { params: { q } });
      setCustomerResults(res.data);
    } catch { setCustomerResults([]); }
    finally { setSearching(false); }
  }, []);

  // ── Create debt ───────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.selectedCustomer && !createForm.newName) {
      setCreateError("Select or enter a customer name."); return;
    }
    if (!createForm.totalAmount || parseFloat(createForm.totalAmount) <= 0) {
      setCreateError("Enter a valid total amount."); return;
    }
    const paid = parseFloat(createForm.amountPaid || 0);
    const total = parseFloat(createForm.totalAmount);
    if (paid > total) {
      setCreateError("Amount paid cannot exceed total amount."); return;
    }

    setCreateLoading(true); setCreateError(null);
    try {
      const payload = {
        total_amount: total,
        amount_paid:  paid,
        description:  createForm.description || null,
        due_date:     createForm.dueDate || null,
        branch_id:    activeBranchId || null,
      };

      if (createForm.selectedCustomer) {
        payload.customer_id = createForm.selectedCustomer.customer_id;
      } else {
        payload.new_customer = {
          full_name: createForm.newName,
          phone:     createForm.newPhone || null,
        };
      }

      await api.post("/debts/", payload);
      setShowCreate(false);
      setCreateForm({ customerSearch: "", selectedCustomer: null, newName: "", newPhone: "", isNew: false, totalAmount: "", amountPaid: "", description: "", dueDate: "" });
      fetchAll();
    } catch (err) {
      setCreateError(err.response?.data?.detail || "Failed to create debt.");
    } finally { setCreateLoading(false); }
  };

  // ── Record payment ────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) {
      setPayError("Enter a valid amount."); return;
    }
    setPayLoading(true); setPayError(null);
    try {
      await api.post(`/debts/${payingDebt.debt_id}/payments`, {
        amount:         parseFloat(payForm.amount),
        payment_method: payForm.method,
        notes:          payForm.notes || null,
      });
      setPayingDebt(null);
      setPayForm({ amount: "", method: "cash", notes: "" });
      fetchAll();
    } catch (err) {
      setPayError(err.response?.data?.detail || "Failed to record payment.");
    } finally { setPayLoading(false); }
  };

  // ── View payment history ──────────────────────────────────────────────────
  const viewHistory = async (debt) => {
    setViewingDebt(debt);
    setHistLoading(true);
    try {
      const res = await api.get(`/debts/${debt.debt_id}/payments`);
      setDebtPayments(res.data);
    } catch { setDebtPayments([]); }
    finally { setHistLoading(false); }
  };

  // ── Write off ─────────────────────────────────────────────────────────────
  const writeOff = async (debt) => {
    if (!confirm(`Write off ₦${fmt(debt.balance)} owed by ${debt.customer_name}? This cannot be undone.`)) return;
    try {
      await api.patch(`/debts/${debt.debt_id}/write-off`);
      fetchAll();
    } catch (err) { alert(err.response?.data?.detail || "Failed to write off debt."); }
  };

  const fmt = (v) => parseFloat(v || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 });

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
          Track customer credit and outstanding balances
        </div>
        {isAdmin && (
          <button onClick={() => { setShowCreate(true); setCreateError(null); }} style={primaryBtn}>
            + Record debt
          </button>
        )}
        {!isAdmin && user.role === "manager" && (
          <button onClick={() => { setShowCreate(true); setCreateError(null); }} style={primaryBtn}>
            + Record debt
          </button>
        )}
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
          <div style={kpiCard}>
            <div style={kpiLabel}>Outstanding</div>
            <div style={{ ...kpiValue, color: "#A32D2D" }}>₦{fmt(summary.total_outstanding)}</div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Debtors</div>
            <div style={{ ...kpiValue, color: "var(--color-text-primary)" }}>{summary.total_debtors}</div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Unpaid</div>
            <div style={{ ...kpiValue, color: "#A32D2D" }}>{summary.open_count}</div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Partial</div>
            <div style={{ ...kpiValue, color: "#854F0B" }}>{summary.partial_count}</div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Overdue</div>
            <div style={{ ...kpiValue, color: summary.overdue_count > 0 ? "#A32D2D" : "#3B6D11" }}>
              {summary.overdue_count}
            </div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Paid off</div>
            <div style={{ ...kpiValue, color: "#3B6D11" }}>{summary.paid_count}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={e => { setSearch(e.target.value); }}
          onKeyDown={e => e.key === "Enter" && fetchAll()}
          style={{ ...inputStyle, minWidth: 200 }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">All statuses</option>
          <option value="open">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="written_off">Written off</option>
        </select>
        <button onClick={fetchAll} style={ghostBtn}>Search</button>
        {(search || filterStatus) && (
          <button onClick={() => { setSearch(""); setFilterStatus(""); setTimeout(fetchAll, 0); }} style={ghostBtn}>
            Clear
          </button>
        )}
      </div>

      {error   && <div style={errorBox}>{error}</div>}
      {loading && <div style={centreMsg}>Loading debts...</div>}

      {/* Debt table */}
      {!loading && (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <th style={th}>Customer</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
                <th style={{ ...th, textAlign: "right" }}>Paid</th>
                <th style={{ ...th, textAlign: "right" }}>Balance</th>
                <th style={th}>Due date</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {debts.length === 0 ? (
                <tr><td colSpan={7} style={emptyTd}>No debts recorded yet.</td></tr>
              ) : debts.map(debt => {
                const isOverdue = debt.due_date && new Date(debt.due_date) < new Date() && !["paid","written_off"].includes(debt.status);
                const sc = STATUS_COLORS[debt.status] || STATUS_COLORS.open;
                return (
                  <tr key={debt.debt_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    <td style={td}>
                      <div style={{ fontWeight: 500, color: "var(--color-text-primary)", fontSize: 13 }}>
                        {debt.customer_name}
                      </div>
                      {debt.customer_phone && (
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{debt.customer_phone}</div>
                      )}
                      {debt.description && (
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{debt.description}</div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>₦{fmt(debt.total_amount)}</td>
                    <td style={{ ...td, textAlign: "right", color: "#3B6D11" }}>₦{fmt(debt.amount_paid)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600, color: debt.balance > 0 ? "#A32D2D" : "#3B6D11" }}>
                      ₦{fmt(debt.balance)}
                    </td>
                    <td style={{ ...td, fontSize: 12, color: isOverdue ? "#A32D2D" : "var(--color-text-secondary)" }}>
                      {debt.due_date ? (
                        <span>{new Date(debt.due_date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}{isOverdue ? " ⚠️" : ""}</span>
                      ) : "—"}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 20, background: sc.bg, color: sc.color }}>
                        {STATUS_LABELS[debt.status] || debt.status}
                      </span>
                    </td>
                    <td style={{ ...td }}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {!["paid","written_off"].includes(debt.status) && (
                          <button onClick={() => { setPayingDebt(debt); setPayForm({ amount: String(debt.balance), method: "cash", notes: "" }); setPayError(null); }} style={actionBtn("#185FA5","#E6F1FB")}>
                            Pay
                          </button>
                        )}
                        <button onClick={() => viewHistory(debt)} style={actionBtn("#3B6D11","#EAF3DE")}>
                          History
                        </button>
                        {isAdmin && !["paid","written_off"].includes(debt.status) && (
                          <button onClick={() => writeOff(debt)} style={actionBtn("#5F5E5A","#F1EFE8")}>
                            Write off
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create debt modal ── */}
      {showCreate && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 460 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>Record debt</h2>
              <button onClick={() => setShowCreate(false)} style={closeBtn}>×</button>
            </div>

            {/* Customer selector */}
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Customer</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button onClick={() => setCreateForm(f => ({ ...f, isNew: false, newName: "", newPhone: "" }))} style={{ ...tabBtn, ...(createForm.isNew ? {} : tabBtnActive) }}>Existing</button>
                <button onClick={() => setCreateForm(f => ({ ...f, isNew: true, selectedCustomer: null, customerSearch: "" }))} style={{ ...tabBtn, ...(createForm.isNew ? tabBtnActive : {}) }}>New customer</button>
              </div>

              {!createForm.isNew ? (
                <div style={{ position: "relative" }}>
                  <input
                    style={formInputStyle}
                    placeholder="Search by name or phone..."
                    value={createForm.selectedCustomer ? `${createForm.selectedCustomer.full_name}${createForm.selectedCustomer.phone ? ` · ${createForm.selectedCustomer.phone}` : ""}` : createForm.customerSearch}
                    onChange={e => {
                      setCreateForm(f => ({ ...f, customerSearch: e.target.value, selectedCustomer: null }));
                      searchCustomers(e.target.value);
                    }}
                  />
                  {customerResults.length > 0 && !createForm.selectedCustomer && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, zIndex: 100, maxHeight: 180, overflowY: "auto" }}>
                      {customerResults.map(c => (
                        <div key={c.customer_id} onClick={() => { setCreateForm(f => ({ ...f, selectedCustomer: c, customerSearch: "" })); setCustomerResults([]); }}
                          style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--color-border-tertiary)", color: "var(--color-text-primary)" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--color-background-secondary)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <div style={{ fontWeight: 500 }}>{c.full_name}</div>
                          {c.phone && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{c.phone}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input style={formInputStyle} placeholder="Full name *" value={createForm.newName} onChange={e => setCreateForm(f => ({ ...f, newName: e.target.value }))} />
                  <input style={formInputStyle} placeholder="Phone number (optional)" value={createForm.newPhone} onChange={e => setCreateForm(f => ({ ...f, newPhone: e.target.value }))} />
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={fieldLabel}>Total amount owed (₦) *</label>
                  <input type="number" min="0" step="0.01" style={formInputStyle} value={createForm.totalAmount} onChange={e => setCreateForm(f => ({ ...f, totalAmount: e.target.value }))} placeholder="e.g. 25000" />
                </div>
                <div>
                  <label style={fieldLabel}>Amount paid upfront (₦)</label>
                  <input type="number" min="0" step="0.01" style={formInputStyle} value={createForm.amountPaid} onChange={e => setCreateForm(f => ({ ...f, amountPaid: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div>
                <label style={fieldLabel}>Description (optional)</label>
                <input style={formInputStyle} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Bought 3 bags of rice on credit" />
              </div>
              <div>
                <label style={fieldLabel}>Due date (optional)</label>
                <input type="date" style={formInputStyle} value={createForm.dueDate} onChange={e => setCreateForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>

            {/* Balance preview */}
            {createForm.totalAmount && (
              <div style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Outstanding balance:</span>
                  <span style={{ fontWeight: 600, color: "#A32D2D" }}>
                    ₦{fmt(Math.max(0, parseFloat(createForm.totalAmount || 0) - parseFloat(createForm.amountPaid || 0)))}
                  </span>
                </div>
              </div>
            )}

            {createError && <div style={{ ...errorBox, marginTop: 12 }}>{createError}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowCreate(false)} style={{ ...modalBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button onClick={handleCreate} disabled={createLoading} style={{ ...modalBtn, background: createLoading ? "var(--color-background-secondary)" : "var(--color-primary)", color: createLoading ? "var(--color-text-tertiary)" : "#fff" }}>
                {createLoading ? "Saving..." : "Record debt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record payment modal ── */}
      {payingDebt && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={modalTitle}>Record payment</h2>
              <button onClick={() => setPayingDebt(null)} style={closeBtn}>×</button>
            </div>

            <div style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{payingDebt.customer_name}</div>
              <div style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>
                Outstanding balance: <strong style={{ color: "#A32D2D" }}>₦{fmt(payingDebt.balance)}</strong>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={fieldLabel}>Amount (₦) *</label>
                <input type="number" min="0" step="0.01" max={payingDebt.balance} style={formInputStyle} value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div>
                <label style={fieldLabel}>Payment method</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {PAYMENT_METHODS.map(m => (
                    <button key={m} onClick={() => setPayForm(f => ({ ...f, method: m }))} style={{
                      flex: 1, padding: "7px 0", borderRadius: 7, cursor: "pointer",
                      textTransform: "capitalize", fontSize: 12,
                      border: `1px solid ${payForm.method === m ? "var(--color-primary)" : "var(--color-border-tertiary)"}`,
                      background: payForm.method === m ? "var(--color-primary-light)" : "var(--color-background-secondary)",
                      color: payForm.method === m ? "var(--color-primary)" : "var(--color-text-secondary)",
                      fontWeight: payForm.method === m ? 500 : 400,
                    }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={fieldLabel}>Notes (optional)</label>
                <input style={formInputStyle} value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Partial payment, rest next week" />
              </div>
            </div>

            {payError && <div style={{ ...errorBox, marginTop: 12 }}>{payError}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setPayingDebt(null)} style={{ ...modalBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button onClick={handlePay} disabled={payLoading} style={{ ...modalBtn, background: payLoading ? "var(--color-background-secondary)" : "var(--color-primary)", color: payLoading ? "var(--color-text-tertiary)" : "#fff" }}>
                {payLoading ? "Recording..." : "Record payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment history modal ── */}
      {viewingDebt && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 460 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={modalTitle}>Payment history</h2>
              <button onClick={() => setViewingDebt(null)} style={closeBtn}>×</button>
            </div>

            <div style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{viewingDebt.customer_name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ color: "var(--color-text-secondary)" }}>Total: <strong>₦{fmt(viewingDebt.total_amount)}</strong></span>
                <span style={{ color: "#3B6D11" }}>Paid: <strong>₦{fmt(viewingDebt.amount_paid)}</strong></span>
                <span style={{ color: "#A32D2D" }}>Balance: <strong>₦{fmt(viewingDebt.balance)}</strong></span>
              </div>
            </div>

            {histLoading ? (
              <div style={centreMsg}>Loading...</div>
            ) : debtPayments.length === 0 ? (
              <div style={centreMsg}>No payments recorded yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {debtPayments.map(p => (
                  <div key={p.payment_id} style={{ background: "var(--color-background-secondary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, color: "#3B6D11", fontSize: 14 }}>₦{fmt(p.amount)}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                        {new Date(p.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                      via {p.payment_method} · recorded by {p.recorded_by}
                    </div>
                    {p.notes && <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 3 }}>{p.notes}</div>}
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setViewingDebt(null)} style={{ ...modalBtn, background: "var(--color-primary)", color: "#fff", marginTop: 16 }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const primaryBtn    = { padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const actionBtn     = (color, bg) => ({ padding: "4px 10px", borderRadius: 6, border: "none", background: bg, color, fontSize: 11, fontWeight: 500, cursor: "pointer" });
const ghostBtn      = { padding: "6px 12px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" };
const modalBtn      = { flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const tabBtn        = { flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" };
const tabBtnActive  = { background: "var(--color-primary-light)", color: "var(--color-primary)", borderColor: "var(--color-primary)", fontWeight: 500 };
const errorBox      = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const centreMsg     = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const tableWrap     = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const th            = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td            = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)", verticalAlign: "middle" };
const emptyTd       = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const kpiCard       = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "12px 14px" };
const kpiLabel      = { fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" };
const kpiValue      = { fontSize: 18, fontWeight: 600 };
const selectStyle   = { padding: "7px 10px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 12, cursor: "pointer" };
const inputStyle    = { padding: "7px 10px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 12, outline: "none", fontFamily: "inherit" };
const formInputStyle = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const overlayStyle  = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle    = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 400, maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow)", border: "1px solid var(--color-border-tertiary)" };
const modalTitle    = { fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 };
const closeBtn      = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-tertiary)", cursor: "pointer", padding: 0, lineHeight: 1 };
const fieldLabel    = { display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5 };