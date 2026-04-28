import { useState, useEffect } from "react";
import api from "../api/api";

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // ── Create business form ──────────────────────────────────────────────────
  const [showBizForm, setShowBizForm]   = useState(false);
  const [bizForm, setBizForm]           = useState({ name: "", address: "", phone: "", owner_name: "" });
  const [bizLoading, setBizLoading]     = useState(false);
  const [bizError, setBizError]         = useState(null);

  // ── Create branch form ────────────────────────────────────────────────────
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [branchBizId, setBranchBizId]       = useState(null);
  const [branchForm, setBranchForm]         = useState({ name: "", location: "" });
  const [branchLoading, setBranchLoading]   = useState(false);
  const [branchError, setBranchError]       = useState(null);

  // ── Create admin form ─────────────────────────────────────────────────────
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminBizId, setAdminBizId]       = useState(null);
  const [adminBranchId, setAdminBranchId] = useState(null);
  const [adminForm, setAdminForm]         = useState({ full_name: "", username: "", password: "" });
  const [adminLoading, setAdminLoading]   = useState(false);
  const [adminError, setAdminError]       = useState(null);
  const [adminSuccess, setAdminSuccess]   = useState(null);

  // ── Expanded business (show branches) ────────────────────────────────────
  const [expanded, setExpanded] = useState({});   // { business_id: [branches] }

  const fetchBusinesses = async () => {
    setLoading(true);
    setError(null);
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

  const toggleExpand = async (biz) => {
    if (expanded[biz.business_id]) {
      setExpanded(e => { const n = { ...e }; delete n[biz.business_id]; return n; });
      return;
    }
    try {
      const res = await api.get(`/businesses/${biz.business_id}/branches`);
      setExpanded(e => ({ ...e, [biz.business_id]: res.data }));
    } catch {
      alert("Failed to load branches.");
    }
  };

  // ── Create business ───────────────────────────────────────────────────────
  const handleCreateBiz = async () => {
    if (!bizForm.name) { setBizError("Business name is required."); return; }
    setBizLoading(true); setBizError(null);
    try {
      await api.post("/businesses/", bizForm);
      setShowBizForm(false);
      setBizForm({ name: "", address: "", phone: "", owner_name: "" });
      fetchBusinesses();
    } catch (err) {
      setBizError(err.response?.data?.detail || "Failed to create business.");
    } finally { setBizLoading(false); }
  };

  // ── Create branch ─────────────────────────────────────────────────────────
  const openBranchForm = (bizId) => { setBranchBizId(bizId); setBranchForm({ name: "", location: "" }); setBranchError(null); setShowBranchForm(true); };
  const handleCreateBranch = async () => {
    if (!branchForm.name) { setBranchError("Branch name is required."); return; }
    setBranchLoading(true); setBranchError(null);
    try {
      await api.post("/businesses/branches", { ...branchForm, business_id: branchBizId });
      setShowBranchForm(false);
      // refresh expanded branches
      const res = await api.get(`/businesses/${branchBizId}/branches`);
      setExpanded(e => ({ ...e, [branchBizId]: res.data }));
      fetchBusinesses();
    } catch (err) {
      setBranchError(err.response?.data?.detail || "Failed to create branch.");
    } finally { setBranchLoading(false); }
  };

  // ── Create admin user ─────────────────────────────────────────────────────
  const openAdminForm = (bizId, branchId) => { setAdminBizId(bizId); setAdminBranchId(branchId); setAdminForm({ full_name: "", username: "", password: "" }); setAdminError(null); setAdminSuccess(null); setShowAdminForm(true); };
  const handleCreateAdmin = async () => {
    if (!adminForm.full_name || !adminForm.username || !adminForm.password) { setAdminError("All fields required."); return; }
    setAdminLoading(true); setAdminError(null);
    try {
      await api.post("/auth/register", {
        ...adminForm,
        role: "admin",
        business_id: adminBizId,
        branch_id: adminBranchId,
      });
      setAdminSuccess(`Admin "${adminForm.username}" created successfully.`);
      setAdminForm({ full_name: "", username: "", password: "" });
    } catch (err) {
      setAdminError(err.response?.data?.detail || "Failed to create admin.");
    } finally { setAdminLoading(false); }
  };

  // ── Toggle active ─────────────────────────────────────────────────────────
  const toggleActive = async (biz) => {
    try {
      await api.patch(`/businesses/${biz.business_id}`, { is_active: !biz.is_active });
      fetchBusinesses();
    } catch { alert("Failed to update business."); }
  };

  return (
    <div style={{ padding: "16px 24px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 2 }}>
            {businesses.length} business{businesses.length !== 1 ? "es" : ""} registered
          </div>
        </div>
        <button onClick={() => { setShowBizForm(true); setBizError(null); }} style={primaryBtn}>
          + New business
        </button>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {loading && <div style={centreMsg}>Loading businesses...</div>}

      {/* Business list */}
      {!loading && businesses.map(biz => (
        <div key={biz.business_id} style={{ ...card, marginBottom: 12 }}>
          {/* Business row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
                  🏢 {biz.name}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
                  background: biz.is_active ? "#EAF3DE" : "#F1EFE8",
                  color: biz.is_active ? "#3B6D11" : "#5F5E5A",
                }}>
                  {biz.is_active ? "ACTIVE" : "INACTIVE"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                {biz.address && <span>📍 {biz.address} &nbsp;</span>}
                {biz.phone    && <span>📞 {biz.phone} &nbsp;</span>}
                {biz.owner_name && <span>👤 {biz.owner_name}</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 3 }}>
                ID: {biz.business_id} · {biz.branch_count ?? 0} branch{biz.branch_count !== 1 ? "es" : ""} · {biz.user_count ?? 0} user{biz.user_count !== 1 ? "s" : ""}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => toggleExpand(biz)} style={outlineBtn}>
                {expanded[biz.business_id] ? "▲ Hide" : "▼ Branches"}
              </button>
              <button onClick={() => openBranchForm(biz.business_id)} style={outlineBtn}>
                + Branch
              </button>
              <button onClick={() => toggleActive(biz)}
                style={{ ...outlineBtn, color: biz.is_active ? "#A32D2D" : "#3B6D11", borderColor: biz.is_active ? "#A32D2D" : "#3B6D11" }}>
                {biz.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </div>

          {/* Branches */}
          {expanded[biz.business_id] && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--color-border-tertiary)", paddingTop: 12 }}>
              {expanded[biz.business_id].length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>No branches yet.</div>
              ) : expanded[biz.business_id].map(br => (
                <div key={br.branch_id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderRadius: 8, marginBottom: 6,
                  background: "var(--color-background-secondary)",
                }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>🏪 {br.name}</span>
                    {br.location && <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 8 }}>📍 {br.location}</span>}
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 8 }}>ID: {br.branch_id}</span>
                  </div>
                  <button onClick={() => openAdminForm(biz.business_id, br.branch_id)} style={outlineBtn}>
                    + Admin user
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* ── Create business modal ── */}
      {showBizForm && (
        <div style={overlay}>
          <div style={modal}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>New business</h2>
              <button onClick={() => setShowBizForm(false)} style={closeBtn}>×</button>
            </div>
            {bizError && <div style={errorBox}>{bizError}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Business name *" value={bizForm.name} onChange={v => setBizForm(f => ({ ...f, name: v }))} placeholder="e.g. WEAR HAUS" />
              <Field label="Owner name"      value={bizForm.owner_name} onChange={v => setBizForm(f => ({ ...f, owner_name: v }))} placeholder="e.g. Joshua Ali" />
              <Field label="Phone"           value={bizForm.phone}  onChange={v => setBizForm(f => ({ ...f, phone: v }))}  placeholder="e.g. 08012345678" />
              <Field label="Address"         value={bizForm.address} onChange={v => setBizForm(f => ({ ...f, address: v }))} placeholder="e.g. 9 Kashim Ibrahim Road, Kaduna" />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowBizForm(false)} style={{ ...cancelBtn, flex: 1 }}>Cancel</button>
              <button onClick={handleCreateBiz} disabled={bizLoading} style={{ ...primaryBtn, flex: 2 }}>
                {bizLoading ? "Creating..." : "Create business"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create branch modal ── */}
      {showBranchForm && (
        <div style={overlay}>
          <div style={modal}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>New branch</h2>
              <button onClick={() => setShowBranchForm(false)} style={closeBtn}>×</button>
            </div>
            {branchError && <div style={errorBox}>{branchError}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Branch name *" value={branchForm.name}     onChange={v => setBranchForm(f => ({ ...f, name: v }))}     placeholder="e.g. Main Branch" />
              <Field label="Location"      value={branchForm.location} onChange={v => setBranchForm(f => ({ ...f, location: v }))} placeholder="e.g. Kaduna" />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowBranchForm(false)} style={{ ...cancelBtn, flex: 1 }}>Cancel</button>
              <button onClick={handleCreateBranch} disabled={branchLoading} style={{ ...primaryBtn, flex: 2 }}>
                {branchLoading ? "Creating..." : "Create branch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create admin user modal ── */}
      {showAdminForm && (
        <div style={overlay}>
          <div style={modal}>
            <div style={modalHeader}>
              <h2 style={modalTitle}>Create admin user</h2>
              <button onClick={() => setShowAdminForm(false)} style={closeBtn}>×</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 12 }}>
              Business ID: {adminBizId} · Branch ID: {adminBranchId}
            </div>
            {adminError   && <div style={errorBox}>{adminError}</div>}
            {adminSuccess && <div style={successBox}>{adminSuccess}</div>}
            {!adminSuccess && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Field label="Full name *" value={adminForm.full_name} onChange={v => setAdminForm(f => ({ ...f, full_name: v }))} placeholder="e.g. Amina Bello" />
                  <Field label="Username *"  value={adminForm.username}  onChange={v => setAdminForm(f => ({ ...f, username: v }))}  placeholder="e.g. amina_admin" />
                  <Field label="Password *"  value={adminForm.password}  onChange={v => setAdminForm(f => ({ ...f, password: v }))}  placeholder="min 6 characters" type="password" />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                  <button onClick={() => setShowAdminForm(false)} style={{ ...cancelBtn, flex: 1 }}>Cancel</button>
                  <button onClick={handleCreateAdmin} disabled={adminLoading} style={{ ...primaryBtn, flex: 2 }}>
                    {adminLoading ? "Creating..." : "Create admin"}
                  </button>
                </div>
              </>
            )}
            {adminSuccess && (
              <button onClick={() => setShowAdminForm(false)} style={{ ...primaryBtn, width: "100%", marginTop: 12 }}>Done</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable field ────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", display: "block" }}>
      {label}
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          display: "block", width: "100%", marginTop: 4,
          padding: "7px 10px", borderRadius: 7, fontSize: 13,
          border: "1px solid var(--color-border-tertiary)",
          background: "var(--color-background-secondary)",
          color: "var(--color-text-primary)", boxSizing: "border-box",
        }}
      />
    </label>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const card       = { background: "var(--color-background-primary)", border: "1px solid var(--color-border-tertiary)", borderRadius: 12, padding: "16px 18px" };
const primaryBtn = { padding: "8px 16px", borderRadius: 8, border: "none", background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const outlineBtn = { padding: "5px 12px", borderRadius: 6, border: "1px solid var(--color-border-tertiary)", background: "none", fontSize: 12, cursor: "pointer", color: "var(--color-text-secondary)" };
const cancelBtn  = { padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border-tertiary)", background: "none", color: "var(--color-text-primary)", fontSize: 13, cursor: "pointer" };
const errorBox   = { background: "#FCEBEB", color: "#A32D2D", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 12 };
const successBox = { background: "#EAF3DE", color: "#3B6D11", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 12 };
const overlay    = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 };
const modal      = { background: "var(--color-background-primary)", borderRadius: 14, padding: 24, width: 420, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.25)" };
const modalHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 };
const modalTitle  = { fontSize: 15, fontWeight: 600, margin: 0, color: "var(--color-text-primary)" };
const closeBtn    = { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--color-text-secondary)", lineHeight: 1, padding: 0 };
const centreMsg   = { textAlign: "center", padding: 60, color: "var(--color-text-secondary)", fontSize: 13 };