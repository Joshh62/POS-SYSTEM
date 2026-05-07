import { useState, useEffect, useCallback } from "react";
import api from "../api/api";

export default function CustomersPage() {
  const user    = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = ["admin", "superadmin"].includes(user.role);
  const canEdit = ["admin", "manager"].includes(user.role);

  const [customers,   setCustomers]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [search,      setSearch]      = useState("");
  const [creditOnly,  setCreditOnly]  = useState(false);

  // ── Add customer modal ────────────────────────────────────────────────────
  const [showAdd,     setShowAdd]     = useState(false);
  const [addForm,     setAddForm]     = useState({ full_name: "", phone: "", email: "", address: "" });
  const [addLoading,  setAddLoading]  = useState(false);
  const [addError,    setAddError]    = useState(null);

  // ── Customer detail panel ─────────────────────────────────────────────────
  const [selected,    setSelected]    = useState(null);   // customer object
  const [ledger,      setLedger]      = useState(null);
  const [sales,       setSales]       = useState(null);
  const [detailTab,   setDetailTab]   = useState("ledger");
  const [detailLoad,  setDetailLoad]  = useState(false);

  // ── Credit settings modal ─────────────────────────────────────────────────
  const [editCredit,  setEditCredit]  = useState(null);
  const [creditForm,  setCreditForm]  = useState({});
  const [creditLoad,  setCreditLoad]  = useState(false);
  const [creditError, setCreditError] = useState(null);

  // ── Record payment modal ──────────────────────────────────────────────────
  const [payCustomer, setPayCustomer] = useState(null);
  const [payForm,     setPayForm]     = useState({ amount: "", method: "cash", notes: "" });
  const [payLoad,     setPayLoad]     = useState(false);
  const [payError,    setPayError]    = useState(null);

  // ── Add debit entry modal ─────────────────────────────────────────────────
  const [debitCustomer, setDebitCustomer] = useState(null);
  const [debitForm,     setDebitForm]     = useState({ amount: "", description: "", due_date: "" });
  const [debitLoad,     setDebitLoad]     = useState(false);
  const [debitError,    setDebitError]    = useState(null);

  const fetchCustomers = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get("/customers/", { params: { search: search || undefined, credit_only: creditOnly } });
      setCustomers(res.data);
    } catch { setError("Failed to load customers."); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCustomers(); }, [creditOnly]);

  const fmt = (v) => `₦${parseFloat(v || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  // ── Add customer ──────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.full_name) { setAddError("Name is required."); return; }
    setAddLoading(true); setAddError(null);
    try {
      await api.post("/customers/", addForm);
      setShowAdd(false);
      setAddForm({ full_name: "", phone: "", email: "", address: "" });
      fetchCustomers();
    } catch (err) {
      setAddError(err.response?.data?.detail || "Failed to add customer.");
    } finally { setAddLoading(false); }
  };

  // ── View customer detail ──────────────────────────────────────────────────
  const viewCustomer = async (c) => {
    setSelected(c);
    setDetailTab("ledger");
    setDetailLoad(true);
    try {
      const [ledgerRes, salesRes] = await Promise.all([
        c.credit_enabled ? api.get(`/ledger/customer/${c.customer_id}`) : Promise.resolve({ data: null }),
        api.get(`/customers/${c.customer_id}/sales`),
      ]);
      setLedger(ledgerRes.data);
      setSales(salesRes.data);
    } catch { setLedger(null); setSales(null); }
    finally { setDetailLoad(false); }
  };

  // ── Update credit settings ────────────────────────────────────────────────
  const handleCreditSave = async () => {
    setCreditLoad(true); setCreditError(null);
    try {
      await api.patch(`/customers/${editCredit.customer_id}/credit`, creditForm);
      setEditCredit(null);
      fetchCustomers();
      if (selected?.customer_id === editCredit.customer_id) viewCustomer({ ...editCredit, ...creditForm });
    } catch (err) {
      setCreditError(err.response?.data?.detail || "Failed to update credit settings.");
    } finally { setCreditLoad(false); }
  };

  // ── Record payment ────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!payForm.amount || parseFloat(payForm.amount) <= 0) { setPayError("Enter a valid amount."); return; }
    setPayLoad(true); setPayError(null);
    try {
      await api.post("/ledger/credit", {
        customer_id:    payCustomer.customer_id,
        amount:         parseFloat(payForm.amount),
        payment_method: payForm.method,
        notes:          payForm.notes || null,
      });
      setPayCustomer(null);
      setPayForm({ amount: "", method: "cash", notes: "" });
      fetchCustomers();
      if (selected?.customer_id === payCustomer.customer_id) viewCustomer(selected);
    } catch (err) {
      setPayError(err.response?.data?.detail || "Failed to record payment.");
    } finally { setPayLoad(false); }
  };

  // ── Add debit entry ───────────────────────────────────────────────────────
  const handleDebit = async () => {
    if (!debitForm.amount || parseFloat(debitForm.amount) <= 0) { setDebitError("Enter a valid amount."); return; }
    setDebitLoad(true); setDebitError(null);
    try {
      await api.post("/ledger/debit", {
        customer_id:  debitCustomer.customer_id,
        amount:       parseFloat(debitForm.amount),
        description:  debitForm.description || null,
        due_date:     debitForm.due_date || null,
      });
      setDebitCustomer(null);
      setDebitForm({ amount: "", description: "", due_date: "" });
      fetchCustomers();
      if (selected?.customer_id === debitCustomer.customer_id) viewCustomer(selected);
    } catch (err) {
      setDebitError(err.response?.data?.detail || "Failed to record debit.");
    } finally { setDebitLoad(false); }
  };

  // ── Write off entry ───────────────────────────────────────────────────────
  const writeOff = async (entryId) => {
    if (!confirm("Write off this debit entry? A credit will be added to cancel it.")) return;
    try {
      await api.patch(`/ledger/entries/${entryId}/write-off`);
      viewCustomer(selected);
    } catch (err) { alert(err.response?.data?.detail || "Failed to write off entry."); }
  };

  const deleteEntry = async (entryId) => {
    if (!confirm("Permanently delete this ledger entry?")) return;
    try {
      await api.delete(`/ledger/entries/${entryId}`);
      viewCustomer(selected);
    } catch (err) { alert(err.response?.data?.detail || "Failed to delete entry."); }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Left: Customer list ── */}
      <div style={{ width: selected ? 320 : "100%", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: selected ? "1px solid var(--color-border-tertiary)" : "none", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text" placeholder="Search customers..." value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && fetchCustomers()}
            style={{ ...inputS, flex: 1, minWidth: 120 }}
          />
          <button onClick={fetchCustomers} style={ghostBtn}>Search</button>
          <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={creditOnly} onChange={e => setCreditOnly(e.target.checked)} />
            Credit only
          </label>
          {canEdit && (
            <button onClick={() => { setShowAdd(true); setAddError(null); }} style={primaryBtn}>+ Add</button>
          )}
        </div>

        {error   && <div style={{ ...errorBox, margin: 12 }}>{error}</div>}
        {loading && <div style={centreMsg}>Loading customers...</div>}

        {/* Customer list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!loading && customers.length === 0 && (
            <div style={centreMsg}>No customers found.</div>
          )}
          {customers.map(c => {
            const isSelected = selected?.customer_id === c.customer_id;
            return (
              <div key={c.customer_id} onClick={() => viewCustomer(c)} style={{
                padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--color-border-tertiary)",
                background: isSelected ? "var(--color-primary-light)" : "transparent",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--color-background-secondary)"; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: isSelected ? "var(--color-primary)" : "var(--color-text-primary)" }}>{c.full_name}</div>
                    {c.phone && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{c.phone}</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    {c.credit_enabled && (
                      <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 20, background: "#E6F1FB", color: "#185FA5" }}>Credit</span>
                    )}
                    {c.credit_enabled && c.balance !== null && c.balance !== 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: c.balance > 0 ? "#A32D2D" : "#3B6D11" }}>
                        {c.balance > 0 ? `Owes ${fmt(c.balance)}` : `Credit ${fmt(Math.abs(c.balance))}`}
                      </span>
                    )}
                    {c.credit_enabled && c.is_overdue && (
                      <span style={{ fontSize: 10, color: "#A32D2D" }}>⚠️ Overdue</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right: Customer detail ── */}
      {selected && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Detail header */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>{selected.full_name}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 3 }}>
                {selected.phone && `📞 ${selected.phone}`}
                {selected.email && ` · ✉️ ${selected.email}`}
              </div>
              {selected.credit_notes && (
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4, fontStyle: "italic" }}>
                  📝 {selected.credit_notes}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {selected.credit_enabled && canEdit && (
                <button onClick={() => { setDebitCustomer(selected); setDebitError(null); }} style={outlineBtn("#854F0B")}>
                  + Debit
                </button>
              )}
              {selected.credit_enabled && (
                <button onClick={() => { setPayCustomer(selected); setPayError(null); setPayForm({ amount: "", method: "cash", notes: "" }); }} style={outlineBtn("#3B6D11")}>
                  Record payment
                </button>
              )}
              {isAdmin && (
                <button onClick={() => { setEditCredit(selected); setCreditForm({ credit_enabled: selected.credit_enabled, credit_limit: selected.credit_limit || "", credit_due_days: selected.credit_due_days, credit_notes: selected.credit_notes || "" }); setCreditError(null); }} style={outlineBtn("#185FA5")}>
                  Credit settings
                </button>
              )}
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", fontSize: 20, color: "var(--color-text-tertiary)", cursor: "pointer" }}>×</button>
            </div>
          </div>

          {/* Balance banner */}
          {selected.credit_enabled && ledger && (
            <div style={{
              padding: "10px 20px", borderBottom: "1px solid var(--color-border-tertiary)",
              background: ledger.balance < 0 ? "#EAF3DE" : ledger.balance > 0 ? "#FCEBEB" : "var(--color-background-secondary)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: ledger.balance < 0 ? "#3B6D11" : ledger.balance > 0 ? "#A32D2D" : "var(--color-text-secondary)" }}>
                {ledger.balance < 0 ? `✅ Account has ${fmt(Math.abs(ledger.balance))} credit` :
                 ledger.balance > 0 ? `⚠️ Owes ${fmt(ledger.balance)}` : "✅ Account clear"}
              </span>
              {ledger.has_overdue && <span style={{ fontSize: 12, color: "#A32D2D" }}>⚠️ {ledger.overdue_count} overdue entries</span>}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--color-border-tertiary)", padding: "0 20px" }}>
            {["ledger", "sales"].map(tab => (
              <button key={tab} onClick={() => setDetailTab(tab)} style={{
                padding: "8px 14px", border: "none", background: "none", fontSize: 13,
                fontWeight: detailTab === tab ? 500 : 400,
                color: detailTab === tab ? "var(--color-primary)" : "var(--color-text-secondary)",
                borderBottom: detailTab === tab ? "2px solid var(--color-primary)" : "2px solid transparent",
                cursor: "pointer", marginBottom: -1,
              }}>
                {tab === "ledger" ? "Credit ledger" : "Purchase history"}
              </button>
            ))}
          </div>

          {/* Detail content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
            {detailLoad && <div style={centreMsg}>Loading...</div>}

            {/* Ledger tab */}
            {!detailLoad && detailTab === "ledger" && (
              !selected.credit_enabled ? (
                <div style={{ ...centreMsg, flexDirection: "column", gap: 8 }}>
                  <div>Credit account not enabled for this customer.</div>
                  {isAdmin && (
                    <button onClick={() => { setEditCredit(selected); setCreditForm({ credit_enabled: true, credit_due_days: 30, credit_notes: "" }); }} style={primaryBtn}>
                      Enable credit account
                    </button>
                  )}
                </div>
              ) : ledger?.entries?.length === 0 ? (
                <div style={centreMsg}>No ledger entries yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {ledger?.entries?.map(e => {
                    const isDebit = e.entry_type === "debit";
                    return (
                      <div key={e.entry_id} style={{ background: "var(--color-background-primary)", border: `1px solid ${e.is_overdue ? "rgba(163,45,45,0.3)" : "var(--color-border-tertiary)"}`, borderRadius: 10, padding: "11px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: isDebit ? "#FCEBEB" : "#EAF3DE", color: isDebit ? "#A32D2D" : "#3B6D11", marginRight: 8 }}>
                              {isDebit ? "DEBIT" : "CREDIT"}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: isDebit ? "#A32D2D" : "#3B6D11" }}>
                              {isDebit ? "" : "+"}{isDebit ? "-" : ""}₦{fmt(e.amount).replace("₦","")}
                            </span>
                          </div>
                          {isAdmin && (
                            <div style={{ display: "flex", gap: 5 }}>
                              {isDebit && !e.description?.includes("Write-off") && (
                                <button onClick={() => writeOff(e.entry_id)} style={tinyBtn("#854F0B","#FAEEDA")}>Write off</button>
                              )}
                              <button onClick={() => deleteEntry(e.entry_id)} style={tinyBtn("#A32D2D","#FCEBEB")}>Delete</button>
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 5 }}>{e.description}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 3, display: "flex", gap: 12 }}>
                          <span>{new Date(e.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                          <span>by {e.recorded_by}</span>
                          {e.due_date && <span style={{ color: e.is_overdue ? "#A32D2D" : "var(--color-text-tertiary)" }}>Due: {new Date(e.due_date).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}{e.is_overdue ? " ⚠️" : ""}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Sales history tab */}
            {!detailLoad && detailTab === "sales" && (
              sales?.sales?.length === 0 ? (
                <div style={centreMsg}>No purchases yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sales?.sales?.map(s => (
                    <div key={s.sale_id} style={{ background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 10, padding: "11px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>Sale #{s.sale_id}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-primary)" }}>{fmt(s.total_amount)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>
                        {new Date(s.date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })} · {s.payment_method}
                      </div>
                      {s.items.map((item, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "2px 0" }}>
                          {item.product} × {item.quantity} — {fmt(item.subtotal)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ── Add customer modal ── */}
      {showAdd && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>Add customer</h2>
              <button onClick={() => setShowAdd(false)} style={closeBtn}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Full name *"><input style={formInputStyle} value={addForm.full_name} onChange={e => setAddForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Alhaji Hassan Musa" /></Field>
              <Field label="Phone number"><input style={formInputStyle} value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. 08012345678" /></Field>
              <Field label="Email (optional)"><input style={formInputStyle} value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="e.g. alhaji@email.com" /></Field>
              <Field label="Address (optional)"><input style={formInputStyle} value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))} placeholder="e.g. Barnawa, Kaduna" /></Field>
            </div>
            {addError && <div style={{ ...errorBox, marginTop: 12 }}>{addError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowAdd(false)} style={{ ...modalBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button onClick={handleAdd} disabled={addLoading} style={{ ...modalBtn, background: addLoading ? "var(--color-background-secondary)" : "var(--color-primary)", color: addLoading ? "var(--color-text-tertiary)" : "#fff" }}>
                {addLoading ? "Saving..." : "Add customer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Credit settings modal ── */}
      {editCredit && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>Credit settings — {editCredit.full_name}</h2>
              <button onClick={() => setEditCredit(null)} style={closeBtn}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 14px" }}>
                <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>Credit account enabled</span>
                <input type="checkbox" checked={creditForm.credit_enabled || false} onChange={e => setCreditForm(f => ({ ...f, credit_enabled: e.target.checked }))} style={{ width: 16, height: 16, cursor: "pointer" }} />
              </div>
              <Field label="Credit limit (₦) — leave blank for no limit">
                <input type="number" min="0" style={formInputStyle} value={creditForm.credit_limit || ""} onChange={e => setCreditForm(f => ({ ...f, credit_limit: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="e.g. 50000" />
              </Field>
              <Field label="Payment due days (default: 30)">
                <input type="number" min="1" style={formInputStyle} value={creditForm.credit_due_days || 30} onChange={e => setCreditForm(f => ({ ...f, credit_due_days: parseInt(e.target.value) }))} />
              </Field>
              <Field label="Notes (internal — not shown to customer)">
                <input style={formInputStyle} value={creditForm.credit_notes || ""} onChange={e => setCreditForm(f => ({ ...f, credit_notes: e.target.value }))} placeholder="e.g. Known customer since 2019, always pays" />
              </Field>
            </div>
            {creditError && <div style={{ ...errorBox, marginTop: 12 }}>{creditError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setEditCredit(null)} style={{ ...modalBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button onClick={handleCreditSave} disabled={creditLoad} style={{ ...modalBtn, background: creditLoad ? "var(--color-background-secondary)" : "var(--color-primary)", color: creditLoad ? "var(--color-text-tertiary)" : "#fff" }}>
                {creditLoad ? "Saving..." : "Save settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record payment modal ── */}
      {payCustomer && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={modalTitle}>Record payment — {payCustomer.full_name}</h2>
              <button onClick={() => setPayCustomer(null)} style={closeBtn}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Amount (₦) *">
                <input type="number" min="0" step="0.01" style={formInputStyle} value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 10000" />
              </Field>
              <Field label="Payment method">
                <div style={{ display: "flex", gap: 8 }}>
                  {["cash","card","transfer"].map(m => (
                    <button key={m} onClick={() => setPayForm(f => ({ ...f, method: m }))} style={{ flex: 1, padding: "7px 0", borderRadius: 7, cursor: "pointer", fontSize: 12, textTransform: "capitalize", border: `1px solid ${payForm.method === m ? "var(--color-primary)" : "var(--color-border-tertiary)"}`, background: payForm.method === m ? "var(--color-primary-light)" : "var(--color-background-secondary)", color: payForm.method === m ? "var(--color-primary)" : "var(--color-text-secondary)", fontWeight: payForm.method === m ? 500 : 400 }}>{m}</button>
                  ))}
                </div>
              </Field>
              <Field label="Notes (optional)">
                <input style={formInputStyle} value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Partial payment, rest next week" />
              </Field>
            </div>
            {payError && <div style={{ ...errorBox, marginTop: 12 }}>{payError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setPayCustomer(null)} style={{ ...modalBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button onClick={handlePay} disabled={payLoad} style={{ ...modalBtn, background: payLoad ? "var(--color-background-secondary)" : "var(--color-primary)", color: payLoad ? "var(--color-text-tertiary)" : "#fff" }}>
                {payLoad ? "Recording..." : "Record payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add debit modal ── */}
      {debitCustomer && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={modalTitle}>Add debit — {debitCustomer.full_name}</h2>
              <button onClick={() => setDebitCustomer(null)} style={closeBtn}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Amount (₦) *">
                <input type="number" min="0" step="0.01" style={formInputStyle} value={debitForm.amount} onChange={e => setDebitForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 25000" />
              </Field>
              <Field label="Description">
                <input style={formInputStyle} value={debitForm.description} onChange={e => setDebitForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. 3 bags of rice on credit" />
              </Field>
              <Field label="Due date (leave blank for default)">
                <input type="date" style={formInputStyle} value={debitForm.due_date} onChange={e => setDebitForm(f => ({ ...f, due_date: e.target.value }))} />
              </Field>
            </div>
            {debitError && <div style={{ ...errorBox, marginTop: 12 }}>{debitError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setDebitCustomer(null)} style={{ ...modalBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>Cancel</button>
              <button onClick={handleDebit} disabled={debitLoad} style={{ ...modalBtn, background: debitLoad ? "var(--color-background-secondary)" : "var(--color-primary)", color: debitLoad ? "var(--color-text-tertiary)" : "#fff" }}>
                {debitLoad ? "Saving..." : "Record debit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const primaryBtn    = { padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" };
const ghostBtn      = { padding: "7px 12px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" };
const outlineBtn    = (color) => ({ padding: "6px 12px", borderRadius: 7, border: `1px solid ${color}`, background: "none", color, fontSize: 12, fontWeight: 500, cursor: "pointer" });
const tinyBtn       = (color, bg) => ({ padding: "2px 8px", borderRadius: 5, border: "none", background: bg, color, fontSize: 10, fontWeight: 500, cursor: "pointer" });
const modalBtn      = { flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const errorBox      = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const centreMsg     = { display: "flex", alignItems: "center", justifyContent: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 13 };
const inputS        = { padding: "7px 10px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 12, outline: "none", fontFamily: "inherit" };
const formInputStyle = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const overlayStyle  = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle    = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow)", border: "1px solid var(--color-border-tertiary)" };
const modalTitle    = { fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 };
const closeBtn      = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-tertiary)", cursor: "pointer", padding: 0, lineHeight: 1 };