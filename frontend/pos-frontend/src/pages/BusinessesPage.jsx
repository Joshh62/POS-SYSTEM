import { useState, useEffect } from "react";
import api from "../api/api";

const PLAN_OPTIONS = ["solo", "starter", "business", "enterprise"];

const FEATURE_LABELS = {
  expiry_tracking:  { label: "Expiry tracking",   desc: "Batch expiry dates and alerts in Inventory" },
  loyalty_program:  { label: "Loyalty program",   desc: "Customer loyalty points and rewards" },
  debt_tracking:    { label: "Debt tracking",     desc: "Track customer credit and outstanding balances" },
  whatsapp_reports: { label: "WhatsApp reports",  desc: "Daily sales summary sent via WhatsApp" },
  expense_tracking: { label: "Expense tracking",  desc: "Log and categorize business expenses" },
  bulk_import:      { label: "Bulk import",       desc: "Import products via CSV/Excel file upload" },
  multi_branch:     { label: "Multi-branch",      desc: "Branch switcher and branch-level reporting" },
  reports:          { label: "Reports",           desc: "Profit, stock valuation, sales summary, audit log" },
  inventory:        { label: "Inventory",         desc: "Stock levels, expiry alerts, restock management" },
};

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // ── New business form ─────────────────────────────────────────────────────
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ name: "", address: "", phone: "", owner_name: "" });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError]     = useState(null);

  // ── Feature flag panel ────────────────────────────────────────────────────
  const [editingFeatures, setEditingFeatures] = useState(null);  // business object
  const [featuresDraft, setFeaturesDraft]     = useState({});
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresError, setFeaturesError]     = useState(null);
  const [featuresSuccess, setFeaturesSuccess] = useState(null);

  // ── Plan edit ─────────────────────────────────────────────────────────────
  const [editingPlan, setEditingPlan]   = useState(null);
  const [planValue, setPlanValue]       = useState("");
  const [planLoading, setPlanLoading]   = useState(false);
  const [planError, setPlanError]       = useState(null);

  const fetchBusinesses = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get("/businesses/");
      setBusinesses(res.data);
    } catch {
      setError("Failed to load businesses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBusinesses(); }, []);

  // ── Create business ───────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.name) { setFormError("Business name is required."); return; }
    setFormLoading(true); setFormError(null);
    try {
      await api.post("/businesses/", form);
      setForm({ name: "", address: "", phone: "", owner_name: "" });
      setShowForm(false);
      fetchBusinesses();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to create business.");
    } finally { setFormLoading(false); }
  };

  // ── Toggle active ─────────────────────────────────────────────────────────
  const toggleActive = async (biz) => {
    try {
      await api.patch(`/businesses/${biz.business_id}`, { is_active: !biz.is_active });
      fetchBusinesses();
    } catch { alert("Failed to update business."); }
  };

  // ── Update plan ───────────────────────────────────────────────────────────
  const openPlan = (biz) => {
    setEditingPlan(biz);
    setPlanValue(biz.plan);
    setPlanError(null);
  };

  const savePlan = async () => {
    setPlanLoading(true); setPlanError(null);
    try {
      await api.patch(`/businesses/${editingPlan.business_id}/plan`, { plan: planValue });
      setEditingPlan(null);
      fetchBusinesses();
    } catch (err) {
      setPlanError(err.response?.data?.detail || "Failed to update plan.");
    } finally { setPlanLoading(false); }
  };

  // ── Feature flags ─────────────────────────────────────────────────────────
  const openFeatures = (biz) => {
    setEditingFeatures(biz);
    setFeaturesDraft(biz.features || {});
    setFeaturesError(null);
    setFeaturesSuccess(null);
  };

  const toggleFlag = (flag) => {
    setFeaturesDraft(d => ({ ...d, [flag]: !d[flag] }));
  };

  const saveFeatures = async () => {
    setFeaturesLoading(true); setFeaturesError(null);
    try {
      await api.patch(`/businesses/${editingFeatures.business_id}/features`, {
        features: featuresDraft,
      });
      setFeaturesSuccess("Features updated successfully.");
      fetchBusinesses();
    } catch (err) {
      setFeaturesError(err.response?.data?.detail || "Failed to update features.");
    } finally { setFeaturesLoading(false); }
  };

  const planColor = (plan) => {
    if (plan === "enterprise") return { bg: "#EAF3DE", color: "#3B6D11" };
    if (plan === "business")   return { bg: "#E6F1FB", color: "#185FA5" };
    if (plan === "starter")    return { bg: "#FAEEDA", color: "#854F0B" };
    return { bg: "#F1EFE8", color: "#5F5E5A" };
  };

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setShowForm(true)} style={primaryBtn}>+ New business</button>
      </div>

      {error   && <div style={errorBox}>{error}</div>}
      {loading && <div style={centreMsg}>Loading businesses...</div>}

      {/* Business cards */}
      {!loading && businesses.map(biz => {
        const pc = planColor(biz.plan);
        return (
          <div key={biz.business_id} style={bizCard}>
            {/* Top row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{biz.name}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                  {biz.owner_name || "—"} · {biz.phone || "—"} · {biz.address || "—"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: biz.is_active ? "#EAF3DE" : "#FCEBEB", color: biz.is_active ? "#3B6D11" : "#A32D2D" }}>
                  {biz.is_active ? "Active" : "Inactive"}
                </span>
                <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: pc.bg, color: pc.color, textTransform: "capitalize" }}>
                  {biz.plan}
                </span>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <div style={statItem}>
                <div style={statVal}>{biz.branch_count}</div>
                <div style={statLabel}>branches</div>
              </div>
              <div style={statItem}>
                <div style={statVal}>{biz.user_count}</div>
                <div style={statLabel}>users</div>
              </div>
              <div style={statItem}>
                <div style={statVal}>{biz.max_users === -1 ? "∞" : biz.max_users}</div>
                <div style={statLabel}>user limit</div>
              </div>
              <div style={statItem}>
                <div style={statVal}>{biz.max_branches === -1 ? "∞" : biz.max_branches}</div>
                <div style={statLabel}>branch limit</div>
              </div>
            </div>

            {/* Feature flags summary */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
              {Object.entries(biz.features || {}).map(([flag, enabled]) => (
                <span key={flag} style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 6, fontWeight: 500,
                  background: enabled ? "rgba(26,111,212,0.1)" : "rgba(163,45,45,0.08)",
                  color:      enabled ? "#185FA5"              : "#A32D2D",
                  textDecoration: enabled ? "none" : "line-through",
                }}>
                  {FEATURE_LABELS[flag]?.label || flag}
                </span>
              ))}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => openFeatures(biz)} style={actionBtn("#185FA5", "#E6F1FB")}>
                🎛 Features
              </button>
              <button onClick={() => openPlan(biz)} style={actionBtn("#854F0B", "#FAEEDA")}>
                📋 Change plan
              </button>
              <button onClick={() => toggleActive(biz)} style={actionBtn(biz.is_active ? "#A32D2D" : "#3B6D11", biz.is_active ? "#FCEBEB" : "#EAF3DE")}>
                {biz.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>
        );
      })}

      {/* ── New business modal ── */}
      {showForm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>New business</h2>
              <button onClick={() => setShowForm(false)} style={closeBtn}>×</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Business name *">
                <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kano Traders Ltd" />
              </Field>
              <Field label="Owner name">
                <input style={inputStyle} value={form.owner_name} onChange={e => setForm({ ...form, owner_name: e.target.value })} placeholder="e.g. Amina Yusuf" />
              </Field>
              <Field label="Phone">
                <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 08012345678" />
              </Field>
              <Field label="Address">
                <input style={inputStyle} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="e.g. 12 Market Road, Kano" />
              </Field>
            </div>
            {formError && <div style={{ ...errorBox, marginTop: 12 }}>{formError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setShowForm(false)} style={{ ...modalBtn, background: "none", border: "1px solid #3a4255", color: "#c0c7d4" }}>Cancel</button>
              <button onClick={handleCreate} disabled={formLoading} style={{ ...modalBtn, background: formLoading ? "#2a3247" : "#185FA5", color: formLoading ? "#5a6475" : "#fff" }}>
                {formLoading ? "Creating..." : "Create business"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change plan modal ── */}
      {editingPlan && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h2 style={modalTitle}>Change plan — {editingPlan.name}</h2>
              <button onClick={() => setEditingPlan(null)} style={closeBtn}>×</button>
            </div>
            <Field label="Plan">
              <select style={inputStyle} value={planValue} onChange={e => setPlanValue(e.target.value)}>
                {PLAN_OPTIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </Field>
            {planError && <div style={{ ...errorBox, marginTop: 10 }}>{planError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => setEditingPlan(null)} style={{ ...modalBtn, background: "none", border: "1px solid #3a4255", color: "#c0c7d4" }}>Cancel</button>
              <button onClick={savePlan} disabled={planLoading} style={{ ...modalBtn, background: planLoading ? "#2a3247" : "#185FA5", color: planLoading ? "#5a6475" : "#fff" }}>
                {planLoading ? "Saving..." : "Save plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Feature flags modal ── */}
      {editingFeatures && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 460 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={modalTitle}>Feature flags</h2>
              <button onClick={() => setEditingFeatures(null)} style={closeBtn}>×</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
              {editingFeatures.name} — toggle features on or off for this business
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {Object.entries(FEATURE_LABELS).map(([flag, { label, desc }]) => {
                const enabled = featuresDraft[flag] !== false;
                return (
                  <div key={flag} onClick={() => toggleFlag(flag)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                    background: enabled ? "rgba(26,111,212,0.06)" : "rgba(163,45,45,0.04)",
                    border: `0.5px solid ${enabled ? "rgba(26,111,212,0.15)" : "rgba(163,45,45,0.12)"}`,
                    marginBottom: 4,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: enabled ? "var(--color-text-primary)" : "var(--color-text-tertiary)", textDecoration: enabled ? "none" : "line-through" }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 2 }}>{desc}</div>
                    </div>
                    {/* Toggle switch */}
                    <div style={{
                      width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                      background: enabled ? "#185FA5" : "#3a4255",
                      position: "relative", transition: "background 0.2s",
                    }}>
                      <div style={{
                        position: "absolute", top: 3,
                        left: enabled ? 19 : 3,
                        width: 14, height: 14, borderRadius: "50%",
                        background: "#fff", transition: "left 0.2s",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {featuresError   && <div style={{ ...errorBox, marginTop: 12 }}>{featuresError}</div>}
            {featuresSuccess && <div style={{ background: "#EAF3DE", color: "#3B6D11", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginTop: 12 }}>{featuresSuccess}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditingFeatures(null)} style={{ ...modalBtn, background: "none", border: "1px solid #3a4255", color: "#c0c7d4" }}>Close</button>
              <button onClick={saveFeatures} disabled={featuresLoading} style={{ ...modalBtn, background: featuresLoading ? "#2a3247" : "#185FA5", color: featuresLoading ? "#5a6475" : "#fff" }}>
                {featuresLoading ? "Saving..." : "Save features"}
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
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#c0c7d4", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const primaryBtn  = { padding: "8px 16px", borderRadius: 8, border: "none", background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const actionBtn   = (color, bg) => ({ padding: "5px 12px", borderRadius: 7, border: "none", background: bg, color, fontSize: 11, fontWeight: 500, cursor: "pointer" });
const modalBtn    = { flex: 1, padding: "11px 0", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const errorBox    = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13 };
const centreMsg   = { textAlign: "center", padding: 40, color: "var(--color-text-tertiary)", fontSize: 13 };
const bizCard     = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 };
const statItem    = { display: "flex", flexDirection: "column", alignItems: "center", background: "var(--color-background-secondary)", borderRadius: 8, padding: "6px 12px", minWidth: 56 };
const statVal     = { fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" };
const statLabel   = { fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 1 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const modalStyle   = { background: "#151b28", borderRadius: 14, padding: 24, width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", border: "1px solid #2a3247" };
const modalTitle   = { fontSize: 16, fontWeight: 600, color: "#e8ecf2", margin: 0 };
const closeBtn     = { background: "none", border: "none", fontSize: 22, color: "#8a93a6", cursor: "pointer", padding: 0, lineHeight: 1 };
const inputStyle   = { display: "block", width: "100%", padding: "9px 11px", borderRadius: 7, border: "1.5px solid #3a4255", fontSize: 13, background: "#1e2535", color: "#e8ecf2", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };