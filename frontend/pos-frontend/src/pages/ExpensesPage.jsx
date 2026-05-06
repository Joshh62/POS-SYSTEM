import { useState, useEffect } from "react";
import api from "../api/api";
import { useBranch } from "../context/BranchContext";

const CATEGORIES = [
  "Rent", "Utilities", "Fuel / Generator", "Transport",
  "Staff welfare", "Maintenance", "Supplies", "Marketing", "Miscellaneous",
];

const CATEGORY_ICONS = {
  "Rent":             "🏠",
  "Utilities":        "💡",
  "Fuel / Generator": "⛽",
  "Transport":        "🚗",
  "Staff welfare":    "👥",
  "Maintenance":      "🔧",
  "Supplies":         "📦",
  "Marketing":        "📣",
  "Miscellaneous":    "📋",
};

export default function ExpensesPage() {
  const { activeBranchId } = useBranch();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = ["admin", "superadmin"].includes(user.role);

  const [expenses,  setExpenses]  = useState([]);
  const [summary,   setSummary]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filterCat,  setFilterCat]  = useState("");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");

  // ── Add form ──────────────────────────────────────────────────────────────
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ category: "", amount: "", description: "", expense_date: "" });
  const [formLoading, setFormLoading] = useState(false);
  const [formError,   setFormError]   = useState(null);

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState(null);

  const fetchAll = async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (activeBranchId) params.branch_id = activeBranchId;
      if (filterCat)      params.category  = filterCat;
      if (dateFrom)       params.date_from = dateFrom;
      if (dateTo)         params.date_to   = dateTo;

      const [expRes, sumRes] = await Promise.all([
        api.get("/expenses/",        { params }),
        api.get("/expenses/summary", { params }),
      ]);
      setExpenses(expRes.data);
      setSummary(sumRes.data);
    } catch {
      setError("Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [activeBranchId, filterCat, dateFrom, dateTo]);

  // ── Add expense ───────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.category) { setFormError("Select a category."); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { setFormError("Enter a valid amount."); return; }
    setFormLoading(true); setFormError(null);
    try {
      await api.post("/expenses/", {
        category:     form.category,
        amount:       parseFloat(form.amount),
        description:  form.description || null,
        expense_date: form.expense_date || null,
        branch_id:    activeBranchId || null,
      });
      setForm({ category: "", amount: "", description: "", expense_date: "" });
      setShowForm(false);
      fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to add expense.");
    } finally { setFormLoading(false); }
  };

  // ── Delete expense ────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await api.delete(`/expenses/${id}`);
      setDeletingId(null);
      fetchAll();
    } catch { alert("Failed to delete expense."); }
  };

  const fmt = (v) => `₦${parseFloat(v || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            Track all business outgoings — rent, fuel, utilities and more
          </div>
        </div>
        <button onClick={() => { setShowForm(true); setFormError(null); }} style={primaryBtn}>
          + Log expense
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
          <div style={kpiCard}>
            <div style={kpiLabel}>Total expenses</div>
            <div style={{ ...kpiValue, color: "#A32D2D" }}>{fmt(summary.total)}</div>
          </div>
          {summary.categories.slice(0, 3).map(c => (
            <div key={c.category} style={kpiCard}>
              <div style={kpiLabel}>{CATEGORY_ICONS[c.category] || "📋"} {c.category}</div>
              <div style={{ ...kpiValue, color: "var(--color-text-primary)" }}>{fmt(c.total)}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{c.count} entries</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          style={selectStyle}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} placeholder="From" />
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={inputStyle} placeholder="To" />
        {(filterCat || dateFrom || dateTo) && (
          <button onClick={() => { setFilterCat(""); setDateFrom(""); setDateTo(""); }} style={clearBtn}>
            Clear filters
          </button>
        )}
      </div>

      {error   && <div style={errorBox}>{error}</div>}
      {loading && <div style={centreMsg}>Loading expenses...</div>}

      {/* Expense list */}
      {!loading && (
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                <th style={th}>Date</th>
                <th style={th}>Category</th>
                <th style={th}>Description</th>
                <th style={th}>Recorded by</th>
                <th style={{ ...th, textAlign: "right" }}>Amount</th>
                {isAdmin && <th style={th}></th>}
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} style={emptyTd}>
                    No expenses recorded yet. Click "Log expense" to add one.
                  </td>
                </tr>
              ) : expenses.map(exp => (
                <tr key={exp.expense_id} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                  <td style={td}>
                    <div style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
                      {new Date(exp.expense_date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </td>
                  <td style={td}>
                    <span style={{
                      fontSize: 12, fontWeight: 500,
                      padding: "3px 10px", borderRadius: 20,
                      background: "var(--color-background-secondary)",
                      color: "var(--color-text-primary)",
                    }}>
                      {CATEGORY_ICONS[exp.category] || "📋"} {exp.category}
                    </span>
                  </td>
                  <td style={{ ...td, color: "var(--color-text-secondary)", fontSize: 12, maxWidth: 260 }}>
                    {exp.description || "—"}
                  </td>
                  <td style={{ ...td, fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {exp.recorded_by}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600, color: "#A32D2D" }}>
                    {fmt(exp.amount)}
                  </td>
                  {isAdmin && (
                    <td style={{ ...td, textAlign: "right" }}>
                      {deletingId === exp.expense_id ? (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => handleDelete(exp.expense_id)} style={dangerBtn}>Confirm</button>
                          <button onClick={() => setDeletingId(null)} style={ghostBtn}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeletingId(exp.expense_id)} style={ghostBtn}>Delete</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--color-border-tertiary)" }}>
                  <td colSpan={isAdmin ? 4 : 3} style={{ ...td, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    Total
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#A32D2D", fontSize: 15 }}>
                    {fmt(summary?.total || 0)}
                  </td>
                  {isAdmin && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── Add expense modal ── */}
      {showForm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>Log expense</h2>
              <button onClick={() => setShowForm(false)} style={closeBtn}>×</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Category *">
                <select
                  style={formInputStyle}
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                >
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>
                  ))}
                </select>
              </Field>

              <Field label="Amount (₦) *">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  style={formInputStyle}
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="e.g. 15000"
                />
              </Field>

              <Field label="Description (optional)">
                <input
                  type="text"
                  style={formInputStyle}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. June rent payment"
                />
              </Field>

              <Field label="Date (leave blank for today)">
                <input
                  type="date"
                  style={formInputStyle}
                  value={form.expense_date}
                  onChange={e => setForm({ ...form, expense_date: e.target.value })}
                />
              </Field>
            </div>

            {formError && <div style={{ ...errorBox, marginTop: 12 }}>{formError}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowForm(false)} style={{ ...modalBtn, background: "none", border: "1px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                Cancel
              </button>
              <button onClick={handleAdd} disabled={formLoading} style={{ ...modalBtn, background: formLoading ? "var(--color-background-secondary)" : "var(--color-primary)", color: formLoading ? "var(--color-text-tertiary)" : "#fff" }}>
                {formLoading ? "Saving..." : "Save expense"}
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
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const primaryBtn    = { padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const dangerBtn     = { padding: "4px 10px", borderRadius: 6, border: "none", background: "#FCEBEB", color: "#A32D2D", fontSize: 11, fontWeight: 500, cursor: "pointer" };
const ghostBtn      = { padding: "4px 10px", borderRadius: 6, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", fontSize: 11, cursor: "pointer" };
const clearBtn      = { padding: "6px 12px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-secondary)", fontSize: 12, cursor: "pointer" };
const modalBtn      = { flex: 1, padding: "10px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const errorBox      = { background: "var(--error-bg)", color: "var(--error-text)", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const centreMsg     = { textAlign: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 13 };
const tableWrap     = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, overflow: "hidden" };
const th            = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" };
const td            = { padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)" };
const emptyTd       = { textAlign: "center", padding: 32, color: "var(--color-text-tertiary)", fontSize: 13 };
const kpiCard       = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "14px 16px" };
const kpiLabel      = { fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" };
const kpiValue      = { fontSize: 20, fontWeight: 600 };
const selectStyle   = { padding: "7px 10px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 12, cursor: "pointer" };
const inputStyle    = { padding: "7px 10px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 12 };
const formInputStyle = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1px solid var(--color-border-tertiary)", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
const overlayStyle  = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle    = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow)", border: "1px solid var(--color-border-tertiary)" };
const closeBtn      = { background: "none", border: "none", fontSize: 22, color: "var(--color-text-tertiary)", cursor: "pointer", padding: 0, lineHeight: 1 };